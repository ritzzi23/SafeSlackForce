import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotSchema } from '@safeslackforce/contracts';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { Agents } from '../src/agents.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { Budget } from '../src/budget.js';
import { Research } from '../src/research.js';
import { createHttp } from '../src/http.js';
import type { Model } from '../src/model.js';

const config = () => readConfig({ DASHBOARD_TOKEN: 'test-only-pairing-token-123456789', SAFESLACKFORCE_MODE: 'fixture', FOLLOWUP_SECONDS: '1' });
async function setup(model?: Model) {
  const store = await Store.open(':memory:'); const domain = new Incidents(store, config());
  const channel = new FixtureChannel(); const notifications = new Notifications(domain, channel);
  const agents = new Agents(domain, notifications, model); const budget = new Budget(store);
  const incident = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '1.000001', user: 'UREPORTER', text: 'Forklift incident at Dock B; one reported injured.' });
  return { store, domain, channel, notifications, agents, budget, id: incident.snapshot.incidentId };
}
test('report idempotency, procedure tasks, notifications, no assumed emergency call', async () => {
  const s = await setup();
  const same = s.domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '1.000001', user: 'UREPORTER', text: 'duplicate' });
  assert.equal(same.snapshot.incidentId, s.id);
  await s.agents.process(s.id);
  assert.equal(s.domain.all().length, 1); assert.equal(s.channel.sent.length, 1);
  s.domain.addMessage(s.id, { ts: '2.000001', user: 'UWITNESS', text: 'The site medic is on the way' });
  const i = s.domain.get(s.id); snapshotSchema.parse(i.snapshot);
  assert.equal(i.snapshot.tasks.find(t => t.id === 'help')!.status, 'assigned');
  assert.equal(i.notifications[0].state, 'sent'); assert.equal(i.notifications[0].acknowledgedBy, undefined);
  s.domain.applyProcedure(s.id); assert.equal(s.domain.get(s.id).snapshot.tasks.length, 3);
  s.store.close();
});
test('unauthorized and stale confirmations fail; acknowledgement does not complete physical work', async () => {
  const s = await setup(); s.domain.applyProcedure(s.id);
  assert.throws(() => s.domain.confirm(s.id, 'area', 'UWITNESS', 'complete', 1, 'I think it is fine'), /Not authorized/);
  s.domain.confirm(s.id, 'area', 'ULEAD', 'acknowledge', 1, 'Taking ownership');
  assert.equal(s.domain.get(s.id).snapshot.tasks.find(t => t.id === 'area')!.status, 'acknowledged');
  assert.throws(() => s.domain.confirm(s.id, 'area', 'ULEAD', 'complete', 1, 'Checked'), /Task changed/);
  assert.throws(() => s.domain.confirm(s.id, 'area', 'ULEAD', 'complete', 2, ''), /note is required/);
  s.store.close();
});
test('missed acknowledgement notifies backup once, and backup can accept ownership', async () => {
  const s = await setup(); await s.agents.process(s.id);
  s.domain.mutate(s.id, 'Advance demo deadline', i => { i.notifications[0].dueAt = 0; });
  await s.notifications.pump(); await s.notifications.pump();
  assert.equal(s.channel.sent.length, 2);
  s.domain.confirm(s.id, 'lead', 'UBACKUP', 'acknowledge', 1, 'I accept coordination');
  assert.equal(s.domain.get(s.id).snapshot.tasks[0].owner?.slackUserId, 'UBACKUP');
  assert.ok(s.domain.get(s.id).notifications.every(n => n.acknowledgedBy === 'UBACKUP'));
  await s.notifications.pump(); assert.equal(s.channel.sent.length, 2); s.store.close();
});
test('timely acknowledgement suppresses follow-up; uncertain send is not automatically duplicated', async () => {
  const s = await setup(); await s.agents.process(s.id);
  s.domain.confirm(s.id, 'lead', 'ULEAD', 'acknowledge', 1, 'Accepted');
  s.domain.mutate(s.id, 'Advance deadline', i => { i.notifications[0].dueAt = 0; });
  await s.notifications.pump(); assert.equal(s.channel.sent.length, 1);
  s.notifications.channel = { async send() { throw new Error('timeout'); } };
  s.notifications.enqueue(s.id, 'area', 'ULEAD', 'Check your assigned task');
  await s.notifications.pump(); assert.equal(s.domain.get(s.id).notifications[1].state, 'uncertain');
  await s.notifications.pump(); assert.equal(s.domain.get(s.id).notifications.length, 2); s.store.close();
});
test('message correction preserves earlier evidence and invalidates affected task', async () => {
  const s = await setup(); s.domain.applyProcedure(s.id);
  s.domain.addMessage(s.id, { ts: '1.000001', user: 'UREPORTER', text: 'Correction: the location is Dock C' });
  assert.equal(s.domain.get(s.id).messages[0].deleted, true);
  assert.equal(s.domain.get(s.id).snapshot.tasks[0].status, 'needs_review');
  assert.throws(() => s.domain.source(s.domain.get(s.id), ['1.000001']), /removed source/);
  assert.equal(s.domain.addMessage(s.id, { ts: '1.000001', user: 'UREPORTER', text: 'Correction: the location is Dock C' }), false);
  s.store.close();
});
test('handoff requires current report; closure remains blocked by critical open tasks', async () => {
  const s = await setup(); s.domain.applyProcedure(s.id);
  s.domain.report(s.id, 'Review outstanding work', ['1.000001']);
  s.domain.agent(s.id, 'records', 'done', 'Report saved'); // presentation events must not stale the report
  s.domain.handoff(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version);
  assert.throws(() => s.domain.close(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version, 'Checked closure requirements'), /Critical tasks/);
  s.domain.addMessage(s.id, { ts: '3.000001', user: 'UWITNESS', text: 'New observation' });
  assert.throws(() => s.domain.handoff(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version), /current handoff report/);
  s.store.close();
});
test('SQLite restores records, ordered event snapshots and budget after restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'safeslackforce-test-')); const path = join(dir, 'test.sqlite');
  const store = await Store.open(path); const d = new Incidents(store, config());
  const i = d.create({ team: 'T', channel: 'C', ts: '9.1', user: 'U', text: 'Report' });
  const b = new Budget(store); const reservation = b.reserve('openrouter', 1, 0.05, 1); b.finish(reservation, 'done', 0.01); store.close();
  const restored = await Store.open(path);
  assert.equal(new Incidents(restored, config()).get(i.snapshot.incidentId).snapshot.title, 'Report');
  assert.equal(restored.events(i.snapshot.incidentId, 0).length, 1);
  assert.equal(new Budget(restored).summary()[0].reportedUsd, 0.01);
  assert.throws(() => new Budget(restored).reserve('openrouter', 1, 0.05, 1), /limit reached/);
  restored.close(); rmSync(dir, { recursive: true });
});
test('model tool permissions reject fabricated tools and report actual failure to model', async () => {
  let round = 0; let sawError = false;
  const model: Model = { async complete(messages) {
    if (round++ === 0) return { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'notify', arguments: '{}' } }] };
    sawError = messages.some(m => m.role === 'tool' && m.content?.includes('not allowed'));
    return { content: 'No notification was sent.' };
  } };
  const s = await setup(model); await assert.rejects(s.agents.run(s.id, 'records', 'Summarize'), /did not inspect/);
  assert.equal(sawError, true); assert.equal(s.channel.sent.length, 0); s.store.close();
});
test('fixture and live stores are separated and cannot dispatch each other’s incidents', async () => {
  const s = await setup();
  assert.equal(s.domain.get(s.id).snapshot.slackThreadUrl, '');
  assert.throws(() => new Incidents(s.store, { ...config(), mode: 'live' }), /another mode/);
  assert.notEqual(config().database, readConfig({ DASHBOARD_TOKEN: config().token, SAFESLACKFORCE_MODE: 'live' }).database);
  s.store.close();
});
test('HTTP pairing, persisted fixture workflow, stale requests and private report access', async () => {
  const s = await setup(); const research = new Research(config(), s.budget, s.store);
  const server = createHttp(s.domain, s.agents, s.budget, research).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/api/incidents`)).status, 401);
    const pair = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: config().token }) });
    assert.equal(pair.status, 200); const cookie = pair.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/api/demo/incidents`, { method: 'POST', headers, body: JSON.stringify({ text: 'Forklift incident at Dock B', ts: '4.000001' }) });
    assert.equal(created.status, 201); const snapshot = snapshotSchema.parse(await created.json());
    assert.equal(snapshot.mode, 'fixture'); assert.equal(snapshot.tasks.length, 3);
    const stale = await fetch(`${base}/api/incidents/${snapshot.incidentId}/agents/commander/questions`, { method: 'POST', headers, body: JSON.stringify({ requestId: 'request-test-1', text: 'Status?', expectedVersion: 0 }) });
    assert.equal(stale.status, 409);
    const badOrigin = await fetch(`${base}/api/incidents`, { headers: { ...headers, Origin: 'https://unrelated.test' } });
    assert.equal(badOrigin.status, 403);
    const report = s.domain.report(snapshot.incidentId, 'Synthetic summary', ['4.000001']);
    assert.equal((await fetch(`${base}/api/incidents/${s.id}/reports/${report.reportId}`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/api/incidents/${snapshot.incidentId}/reports/${report.reportId}`, { headers })).status, 200);
    const controller = new AbortController();
    const events = await fetch(`${base}/api/incidents/${snapshot.incidentId}/events?after=0`, { headers, signal: controller.signal });
    const reader = events.body!.getReader(); const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /event: snapshot.updated/); controller.abort(); await reader.cancel().catch(() => {});
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); s.store.close(); }
});

test('incident titles drop Slack mentions, quote markers and HTML entities', async () => {
  const { slackTitle } = await import('../src/domain.js');
  assert.equal(slackTitle('&gt; <@U0C1J667B0C> SYNTHETIC DEMO: Forklift &amp; pallet at Dock B'), 'SYNTHETIC DEMO: Forklift & pallet at Dock B');
  assert.equal(slackTitle('<@U123>'), 'Incident report');
});

test('paired dashboard sessions survive an API restart and die when the token rotates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ssf-session-'));
  const { createHttp } = await import('../src/http.js');
  const { Research } = await import('../src/research.js');
  const path = join(dir, 'db.sqlite');
  const boot = async (token: string) => {
    const config = readConfig({ DASHBOARD_TOKEN: token, SAFESLACKFORCE_MODE: 'fixture' } as any);
    const store = await Store.open(path); const domain = new Incidents(store, config); const budget = new Budget(store);
    const agents = new Agents(domain, new Notifications(domain, new FixtureChannel()));
    const server = createHttp(domain, agents, budget, new Research(config, budget, store)).listen(0);
    await new Promise(r => server.once('listening', r));
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    return { url, stop: () => { server.close(); store.close(); } };
  };
  const token = 'a'.repeat(32);
  let s = await boot(token);
  const paired = await fetch(`${s.url}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  const cookie = paired.headers.get('set-cookie')!.split(';')[0];
  s.stop(); s = await boot(token);
  assert.equal((await fetch(`${s.url}/api/incidents`, { headers: { cookie } })).status, 200);
  s.stop(); s = await boot('b'.repeat(32));
  assert.equal((await fetch(`${s.url}/api/incidents`, { headers: { cookie } })).status, 401);
  s.stop(); rmSync(dir, { recursive: true, force: true });
});
