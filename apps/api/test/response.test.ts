import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { readConfig } from '../src/config.js';
import { FixtureChannel, Notifications } from '../src/notifications.js';
import { ResponseOperations } from '../src/response.js';
import { Agents } from '../src/agents.js';
import { Autopilot } from '../src/autopilot.js';
import { SlackIntake } from '../src/intake.js';

async function setup(synthetic = true) {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'autonomous-response-test-token', AUTONOMOUS_RESPONSE_ENABLED: 'true', EMERGENCY_CALL_MODE: 'simulation' }));
  const channel = new FixtureChannel(), operations = new ResponseOperations(domain, channel);
  const id = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UWITNESS', text: `${synthetic ? 'SYNTHETIC DEMO: ' : ''}Forklift injury reported at Loading Dock B` }).snapshot.incidentId;
  return { store, domain, channel, operations, id };
}
test('management, scheduling and call simulation run before any task ownership acceptance', async () => {
  const s = await setup();
  try {
    await Promise.all([s.operations.ensure(s.id), s.operations.ensure(s.id)]);
    const i = s.domain.get(s.id), actions = i.snapshot.responseActions!;
    assert.equal(i.snapshot.tasks.length, 0);
    assert.equal(actions.length, 3);
    assert.equal(actions.find(a => a.kind === 'management')!.status, 'completed');
    assert.equal(actions.find(a => a.kind === 'followup')!.status, 'scheduled');
    assert.equal(actions.find(a => a.kind === 'emergency_call')!.status, 'simulated');
    assert.match(actions.find(a => a.kind === 'emergency_call')!.summary, /No telephone call was placed/);
    assert.equal(s.channel.sent.length, 1);
    assert.match(s.channel.sent[0].text, /<@USUPERVISOR>/);
    await new ResponseOperations(s.domain, s.channel).ensure(s.id);
    assert.equal(s.channel.sent.length, 1, 'restarts do not repeat management alerts');
  } finally { s.store.close(); }
});
test('due follow-up is delivered even when tasks are acknowledged but incomplete', async () => {
  const s = await setup();
  try {
    s.domain.applyProcedure(s.id);
    await s.operations.ensure(s.id);
    s.domain.acceptAssigned(s.id, 'ULEAD', s.domain.get(s.id).snapshot.version);
    const updated = await s.operations.run(s.id, { action: 'followup', reason: 'Recheck open scene tasks soon.', delaySeconds: 30 });
    await Promise.all([s.operations.pump(Date.parse(updated.dueAt!) + 1), s.operations.pump(Date.parse(updated.dueAt!) + 1)]);
    assert.equal(s.channel.sent.length, 2);
    assert.equal(s.domain.get(s.id).snapshot.responseActions!.find(a => a.id === 'followup')!.status, 'completed');
    assert.ok(s.domain.get(s.id).snapshot.tasks.every(t => t.status === 'acknowledged'));
    await s.operations.pump(Date.now() + 1000000);
    assert.equal(s.channel.sent.length, 2);
  } finally { s.store.close(); }
});
test('uncertain management delivery never repeats automatically or stops other actions', async () => {
  const s = await setup();
  try {
    let attempts = 0;
    const service = new ResponseOperations(s.domain, { async send() { attempts++; throw new Error('timeout after possible delivery'); } });
    await service.ensure(s.id); await service.ensure(s.id);
    assert.equal(attempts, 1);
    assert.equal(s.domain.get(s.id).snapshot.responseActions!.find(a => a.id === 'management')!.status, 'uncertain');
    assert.equal(s.domain.get(s.id).snapshot.responseActions!.find(a => a.id === 'followup')!.status, 'scheduled');
  } finally { s.store.close(); }
});
test('a non-synthetic incident cannot be reported as a simulated or connected emergency call', async () => {
  const s = await setup(false);
  try {
    await s.operations.ensure(s.id);
    const a = s.domain.get(s.id).snapshot.responseActions!.find(a => a.id === 'emergency_call')!;
    assert.equal(a.status, 'blocked'); assert.equal(a.receipt, null);
    assert.match(a.summary, /No call placed/);
    assert.equal(s.domain.get(s.id).snapshot.responseActions!.find(a => a.id === 'management')!.status, 'completed');
  } finally { s.store.close(); }
});
test('a participant thread update automatically coordinates and drafts a report without approvals', async () => {
  const s = await setup();
  const agents = new Agents(s.domain, new Notifications(s.domain, s.channel));
  const pilot = new Autopilot(s.domain, agents, 20, 60000); pilot.start();
  try {
    const intake = new SlackIntake(s.domain, agents);
    assert.equal(intake.receive({ type: 'message', channel: 'CDEMO', thread_ts: '100.1', ts: '101.1', user: 'UNEWJOINER', text: 'SYNTHETIC UPDATE: Area status is still unknown.' }, 'TDEMO', 'Ev-joiner'), s.id);
    await agents.enqueue(s.id, async () => {});
    await pilot.tick(s.id);
    const i = s.domain.get(s.id);
    assert.equal(i.messages.at(-1)!.author, 'UNEWJOINER');
    assert.equal(i.snapshot.reports.length, 1);
    assert.equal(i.acceptedBy, undefined);
    assert.ok(i.snapshot.tasks.every(t => t.status === 'assigned'));
    const report = s.store.get<{ markdown: string }>(i.snapshot.reports[0].id)!;
    assert.match(report.markdown, /Autonomous response actions/);
    assert.match(report.markdown, /SIMULATED emergency-call dispatch/);
  } finally { pilot.stop(); await agents.drain(); s.store.close(); }
});

test('model failure cannot stop autonomous structured report generation', async () => {
  const s = await setup();
  const agents = new Agents(s.domain, new Notifications(s.domain, s.channel), { async complete() { throw new Error('Agent context limit reached'); } });
  try {
    s.domain.applyProcedure(s.id);
    await s.operations.ensure(s.id);
    await agents.prepareReport(s.id, 'Prepare current report');
    const i = s.domain.get(s.id);
    assert.equal(i.snapshot.reports.length, 1);
    assert.equal(i.snapshot.agents.find(a => a.id === 'records')!.status, 'done');
    const report = s.store.get<{ markdown: string }>(i.snapshot.reports[0].id)!;
    assert.match(report.markdown, /AI narrative unavailable/);
    assert.match(report.markdown, /100.1/);
    assert.match(report.markdown, /No telephone call was placed/);
    assert.ok(i.snapshot.tasks.every(t => t.status === 'assigned'));
  } finally { await agents.drain(); s.store.close(); }
});
