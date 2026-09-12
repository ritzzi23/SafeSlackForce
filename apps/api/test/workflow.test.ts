import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { Agents } from '../src/agents.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { SlackIntake } from '../src/intake.js';
import { SummaryPublisher } from '../src/summary.js';
import { Budget } from '../src/budget.js';
import { Research } from '../src/research.js';
import { createHttp } from '../src/http.js';
import type { Model, ModelMessage, Completion } from '../src/model.js';

const cfg = () => readConfig({ DASHBOARD_TOKEN: 'test-only-workflow-token-12345678', INCIDENTOS_MODE: 'fixture', MODEL_MAX_ROUNDS: '10' });
async function setup(model?: Model) {
  const store = await Store.open(':memory:'); const domain = new Incidents(store, cfg());
  const channel = new FixtureChannel(); const notifications = new Notifications(domain, channel);
  const agents = new Agents(domain, notifications, model);
  const incident = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'Forklift incident at Dock B' });
  return { store, domain, channel, notifications, agents, id: incident.snapshot.incidentId };
}
const call = (name: string, args: object = {}): Completion => ({ content: null, tool_calls: [{ id: `${name}-${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

test('all five agent roles execute real tools with a scripted model transport, including report persistence', async () => {
  const roles = new Set<string>();
  const model: Model = { async complete(messages: ModelMessage[]) {
    const role = /^You are SafeSlackForce (\w+)/.exec(messages[0].content!)![1]; roles.add(role);
    const previous = messages.filter(m => m.role === 'assistant').flatMap(m => m.tool_calls ?? []).map(t => t.function.name);
    const delegated = messages.filter(m => m.role === 'assistant').flatMap(m => m.tool_calls ?? []).filter(t => t.function.name === 'delegate').map(t => JSON.parse(t.function.arguments).agent);
    if (!previous.includes('read_incident')) return call('read_incident');
    if (role === 'commander') {
      for (const agent of ['procedure', 'evidence', 'communications', 'records']) if (!delegated.includes(agent)) return call('delegate', { agent, task: 'Complete your bounded work' });
    }
    if (role === 'procedure') {
      if (!previous.includes('read_procedure')) return call('read_procedure');
      if (!previous.includes('apply_procedure')) return call('apply_procedure');
    }
    if (role === 'evidence' && !previous.includes('record_fact')) return call('record_fact', { text: 'Forklift incident reported at Dock B', sources: ['100.1'] });
    if (role === 'communications' && !previous.includes('notify')) return call('notify', { taskId: 'lead', recipient: 'ULEAD', text: 'Please accept coordination' });
    if (role === 'records') {
      const pages = messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content!)).filter(v => 'nextOffset' in v);
      if (!pages.length || pages.at(-1).nextOffset !== null) return call('read_history', { offset: pages.at(-1)?.nextOffset ?? 0 });
      if (!previous.includes('save_report')) return call('save_report', { summary: 'Coordination sent; human acknowledgement remains outstanding.', sources: ['100.1'] });
    }
    return { content: 'Tool work complete; human tasks remain open. Source: 100.1' };
  } };
  const s = await setup(model);
  try {
    await s.agents.process(s.id);
    const i = s.domain.get(s.id);
    assert.equal(roles.size, 5); assert.equal(i.snapshot.tasks.length, 3);
    assert.equal(s.channel.sent.length, 1); assert.equal(i.facts.length, 1);
    assert.equal(i.snapshot.reports.length, 1); assert.equal(i.snapshot.status, 'handoff_ready');
    assert.equal(i.snapshot.agents.find(a => a.id === 'communications')!.status, 'waiting');
    assert.equal(i.snapshot.agents.filter(a => a.status === 'failed').length, 0);
    s.domain.handoff(s.id, 'USUPERVISOR', i.snapshot.version);
    assert.ok(s.domain.get(s.id).snapshot.tasks.every(t => t.status !== 'completed'));
  } finally { s.store.close(); }
});

test('Slack envelopes deduplicate overlapping deliveries, reject unrelated traffic and ignore older edits', async () => {
  const s = await setup(); const intake = new SlackIntake(s.domain, s.agents);
  const report = { type: 'app_mention', channel: 'CDEMO', user: 'UREPORTER', ts: '200.1', text: 'Forklift incident at Dock B' };
  try {
    const id = intake.receive(report, 'TDEMO', 'Ev1')!;
    assert.equal(intake.receive(report, 'TDEMO', 'Ev1'), undefined);
    assert.equal(intake.receive({ ...report, type: 'message' }, 'TDEMO', 'Ev2'), undefined);
    assert.equal(intake.receive({ ...report, ts: '300.1' }, 'OTHER'), undefined);
    assert.equal(intake.receive({ ...report, ts: '300.1', bot_id: 'BOT' }, 'TDEMO'), undefined);
    await s.agents.enqueue(id, async () => {});
    assert.equal(s.channel.sent.length, 1);
    intake.receive({ type: 'message', channel: 'CDEMO', subtype: 'message_changed', event_ts: '400.1', message: { ...report, text: 'Forklift incident at Dock C', edited: { ts: '400.1' } } }, 'TDEMO', 'Ev3');
    await s.agents.enqueue(id, async () => {});
    intake.receive({ type: 'message', channel: 'CDEMO', subtype: 'message_changed', event_ts: '350.1', message: { ...report, text: 'Older incorrect edit', edited: { ts: '350.1' } } }, 'TDEMO', 'Ev4');
    assert.equal(s.domain.get(id).messages.filter(m => !m.deleted).at(-1)!.text, 'Forklift incident at Dock C');
  } finally { await s.agents.drain(); s.store.close(); }
});

test('single summary card is updated, including fresh task versions; uncertain initial sends do not duplicate', async () => {
  const s = await setup(); let posts = 0; let updates = 0; let latest: unknown;
  const publisher = new SummaryPublisher(s.domain, { post: async (_c, _t, _text, blocks) => { posts++; latest = blocks; return '999.1'; }, update: async (_c, _t, _text, blocks) => { updates++; latest = blocks; } });
  try {
    s.domain.applyProcedure(s.id); await publisher.publish(s.id);
    s.domain.confirm(s.id, 'area', 'ULEAD', 'acknowledge', 1, 'Taking ownership');
    await publisher.publish(s.id);
    assert.equal(posts, 1); assert.equal(updates, 1); assert.match(JSON.stringify(latest), /acknowledged/);
    const other = s.domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '700.1', user: 'U', text: 'Forklift at Dock B' });
    let failures = 0;
    const failing = new SummaryPublisher(s.domain, { post: async () => { failures++; throw new Error('Timeout'); }, update: async () => {} });
    await failing.publish(other.snapshot.incidentId); await failing.publish(other.snapshot.incidentId);
    assert.equal(failures, 1); failing.stop();
  } finally { publisher.stop(); s.store.close(); }
});

test('retry requires supervisor acknowledgement of duplication risk and does not reopen completed work', async () => {
  const s = await setup(); s.domain.applyProcedure(s.id);
  const n = s.notifications.enqueue(s.id, 'lead', 'ULEAD', 'Accept ownership');
  s.domain.mutate(s.id, 'Synthetic delivery failure', i => { i.notifications[0].state = 'uncertain'; });
  assert.throws(() => s.notifications.retry(s.id, n.id, 'UWITNESS', true), /Supervisor/);
  assert.throws(() => s.notifications.retry(s.id, n.id, 'USUPERVISOR', false), /Inspect Slack/);
  s.notifications.retry(s.id, n.id, 'USUPERVISOR', true); await s.notifications.pump();
  assert.equal(s.domain.get(s.id).notifications[0].state, 'sent');
  s.domain.confirm(s.id, 'lead', 'ULEAD', 'complete', 1, 'Accepted lead responsibility');
  assert.throws(() => s.notifications.retry(s.id, n.id, 'USUPERVISOR', true), /no longer needed/); s.store.close();
});

test('procedure rejects unrelated incidents, and closure needs human evidence after handoff', async () => {
  const s = await setup();
  const other = s.domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '800.1', user: 'U', text: 'Lost laptop in cafeteria' });
  assert.throws(() => s.domain.applyProcedure(other.snapshot.incidentId), /No matching/);
  s.domain.applyProcedure(s.id);
  for (const task of s.domain.get(s.id).snapshot.tasks) s.domain.confirm(s.id, task.id, 'ULEAD', 'complete', task.version, 'Synthetic explicit human confirmation');
  s.domain.report(s.id, 'Confirmed coordination record', ['100.1']);
  s.domain.handoff(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version);
  assert.throws(() => s.domain.close(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version), /note/);
  s.domain.close(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version, 'All fixture work verified by lead');
  assert.equal(s.domain.get(s.id).snapshot.status, 'closed');
  s.domain.addMessage(s.id, { ts: '900.1', text: 'New contradictory observation', user: 'UWITNESS' });
  assert.equal(s.domain.get(s.id).snapshot.status, 'coordinating'); s.store.close();
});

test('confirmed voice relay is idempotent and fixture reset archives without deleting usage', async () => {
  const s = await setup(); const budget = new Budget(s.store);
  budget.reserve('openrouter', 5, 0.05, 1);
  const server = createHttp(s.domain, s.agents, budget, new Research(cfg(), budget, s.store)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Authorization: `Bearer ${cfg().token}`, 'Content-Type': 'application/json' };
  const body = { requestId: 'voice-test-123', expectedVersion: s.domain.get(s.id).snapshot.version, text: 'Forklift at Dock B; site medic reported on the way', confirmed: true };
  try {
    assert.equal((await fetch(`${base}/api/incidents/${s.id}/transcripts`, { method: 'POST', headers, body: JSON.stringify({ ...body, confirmed: false }) })).status, 400);
    assert.equal((await fetch(`${base}/api/incidents/${s.id}/transcripts`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 202);
    await s.agents.enqueue(s.id, async () => {});
    assert.equal((await fetch(`${base}/api/incidents/${s.id}/transcripts`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 200);
    assert.equal(s.domain.get(s.id).messages.filter(m => m.origin === 'confirmed_transcript').length, 1);
    assert.equal(s.channel.sent.filter(m => m.text.includes('reviewed voice transcript')).length, 1);
    const reset = await fetch(`${base}/api/demo/reset`, { method: 'POST', headers, body: JSON.stringify({ confirmation: 'ARCHIVE FIXTURE INCIDENTS' }) });
    assert.equal(reset.status, 200); assert.equal(s.domain.all().length, 0);
    assert.equal(budget.summary()[0].accountedUsd, 0.05); assert.ok(s.domain.get(s.id).snapshot.activity.length);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await s.agents.drain(); s.store.close(); }
});

test('Evidence flags only a named conflicting task and leaves unrelated tasks unchanged', async () => {
  let round = 0;
  const model: Model = { async complete() {
    if (round++ === 0) return call('read_incident');
    if (round === 2) return call('flag_contradiction', { taskId: 'area', reason: 'Conflicting reports of Dock B access', sources: ['200.1', '300.1'] });
    return { content: 'Area status needs lead review. Sources: 200.1, 300.1.' };
  } };
  const s = await setup(model);
  try {
    s.domain.applyProcedure(s.id);
    s.domain.addMessage(s.id, { ts: '200.1', user: 'UA', text: 'Dock B access has been blocked off' });
    s.domain.addMessage(s.id, { ts: '300.1', user: 'UB', text: 'Dock B access is still open at the same time' });
    await s.agents.run(s.id, 'evidence', 'Compare reports');
    const i = s.domain.get(s.id);
    assert.equal(i.snapshot.tasks.find(t => t.id === 'area')!.status, 'needs_review');
    assert.equal(i.snapshot.tasks.find(t => t.id === 'help')!.status, 'assigned');
    assert.equal(i.snapshot.agents.find(a => a.id === 'evidence')!.status, 'blocked');
    assert.ok(i.snapshot.agents.find(a => a.id === 'evidence')!.sources.some(s => s.id === '300.1'));
  } finally { s.store.close(); }
});

test('a confident model answer cannot turn a failed tool into successful agent status', async () => {
  let round = 0;
  const model: Model = { async complete() {
    if (round++ === 0) return call('read_incident');
    if (round === 2) return call('notify', { taskId: 'lead', recipient: 'UNAUTHORIZED', text: 'Please coordinate' });
    return { content: 'Everything succeeded.' };
  } };
  const s = await setup(model);
  try {
    s.domain.applyProcedure(s.id);
    const answer = await s.agents.run(s.id, 'communications', 'Send notification');
    assert.match(answer, /^Incomplete:/);
    assert.equal(s.domain.get(s.id).snapshot.agents.find(a => a.id === 'communications')!.status, 'failed');
    assert.equal(s.channel.sent.length, 0);
  } finally { s.store.close(); }
});
