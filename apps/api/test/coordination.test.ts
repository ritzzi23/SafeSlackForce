import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Agents } from '../src/agents.js';
import { Autopilot } from '../src/autopilot.js';
import { readConfig } from '../src/config.js';
import { Incidents } from '../src/domain.js';
import { SlackIntake } from '../src/intake.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { Store } from '../src/store.js';
import { OfficeDirectory } from '../src/office.js';
import { seedOffice } from '../src/seed-office.js';
import { Media } from '../src/media.js';
import type { Completion, Model } from '../src/model.js';

const call = (name: string, args = {}): Completion => ({ content: null, tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

async function setup(options: { stubborn?: boolean; question?: boolean; failEvidence?: boolean; delegateProcedure?: boolean; reportPromise?: boolean } = {}) {
  const store = await Store.open(':memory:'), office = await Store.open(':memory:'), restricted = await Store.open(':memory:');
  seedOffice(office, restricted);
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'coordination-test-token-12345678', MODEL_MAX_ROUNDS: '10' }), new OfficeDirectory(office));
  const channel = new FixtureChannel();
  const runs: string[] = [];
  const model: Model = { async complete(messages) {
    const role = /^You are SafeSlackForce (\w+)/.exec(messages[0].content!)![1];
    const calls = messages.filter(m => m.role === 'assistant').flatMap(m => m.tool_calls ?? []);
    const did = (name: string) => calls.some(c => c.function.name === name);
    if (!did('read_incident')) { runs.push(role); return call('read_incident'); }
    if (role === 'commander') {
      if (!did('update_location')) return call('update_location', { location: 'Loading Dock B', sources: ['200.1'] });
      if (options.delegateProcedure && !did('delegate')) return call('delegate', { agent: 'procedure', task: 'Match the procedure and create its tasks.' });
      if (options.question && !did('ask_human')) return call('ask_human', { text: 'Who can provide the next verified observation?' });
      // Deliberately omits Evidence and Communications, reproducing the real failure.
      return { content: 'I am waiting for a person to tell me what to do next.' };
    }
    if (role === 'procedure') {
      if (!did('read_procedure')) return call('read_procedure');
      if (!did('read_office')) return call('read_office', { category: 'policies', query: 'privacy' });
      if (!did('apply_procedure')) return call('apply_procedure');
    }
    if (role === 'evidence') {
      if (options.failEvidence) throw new Error('Synthetic evidence provider failure');
      if (!did('record_fact')) return call('record_fact', { text: 'Injury reported; area and emergency-service contact unconfirmed.', sources: ['200.1'] });
    }
    if (role === 'communications') {
      // First tries to finish without sending; the completion check must correct this.
      const reminded = messages.some(m => m.role === 'system' && m.content?.startsWith('Notify these assigned'));
      if (options.stubborn || !reminded) return { content: 'I will notify the owners.' };
      const incident = JSON.parse(messages.find(m => m.role === 'tool')!.content!);
      const task = incident.tasks.find((t: { id: string }) => !calls.some(c => c.function.name === 'notify' && JSON.parse(c.function.arguments).taskId === t.id) && !incident.notifications.some((n: { taskId: string }) => n.taskId === t.id));
      if (task) return call('notify', { taskId: task.id, recipient: 'ULEAD', text: `Please accept ownership: ${task.title}` });
    }
    if (role === 'records') {
      if (options.reportPromise && !messages.some(m => m.role === 'system' && m.content?.startsWith('No report has been saved'))) return { content: 'The report is saved and ready.' };
      const pages = messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content!)).filter(v => 'nextOffset' in v);
      if (!pages.length || pages.at(-1).nextOffset !== null) return call('read_history', { offset: pages.at(-1)?.nextOffset ?? 0 });
      if (!did('save_report')) return call('save_report', { summary: 'Synthetic incident: all physical work remains open and unconfirmed.', sources: ['200.1'] });
    }
    return { content: 'Digital work reviewed; human actions remain unconfirmed.' };
  } };
  const agents = new Agents(domain, new Notifications(domain, channel), model);
  const pilot = new Autopilot(domain, agents, 4, 60000); pilot.start();
  const intake = new SlackIntake(domain, agents);
  const event = { type: 'app_mention', channel: 'CDEMO', user: 'ULEAD', ts: '200.1', text: 'SYNTHETIC: Forklift incident at Loading Dock B; one injury reported.' };
  return { domain, channel, runs, agents, pilot, intake, event, async close() { pilot.stop(); await agents.drain(); store.close(); office.close(); restricted.close(); } };
}

test('one report triggers missing specialists, real tools and a sourced draft before human acknowledgement', async () => {
  const s = await setup({ question: true, delegateProcedure: true });
  try {
    const id = s.intake.receive(s.event, 'TDEMO', 'Ev-autonomous')!;
    assert.equal(s.intake.receive(s.event, 'TDEMO', 'Ev-autonomous'), undefined);
    await s.agents.enqueue(id, async () => {});
    await s.pilot.tick(id);
    const i = s.domain.get(id);
    assert.deepEqual(s.runs, ['commander', 'procedure', 'evidence', 'communications', 'records']);
    assert.equal(i.snapshot.location, 'Loading Dock B');
    assert.equal(i.facts.length, 1);
    assert.equal(i.notifications.length, 3);
    assert.ok(i.notifications.every(n => n.state === 'sent' && !n.acknowledgedBy));
    assert.ok(i.snapshot.tasks.every(t => t.status === 'assigned'));
    assert.equal(i.snapshot.reports.length, 1);
    assert.equal(i.snapshot.status, 'handoff_ready');
    assert.equal(i.acceptedBy, undefined);
    assert.ok(i.snapshot.activity.some(a => a.sources.some(ref => ref.id === 'office:policy-privacy')));
    assert.match(s.channel.sent.at(-1)!.text, /Coordination update/);
    assert.equal(s.channel.sent.length, 4, 'three notification receipts and one consolidated question');
    assert.equal(i.snapshot.agents[0].status, 'waiting');
    assert.match(i.snapshot.agents[0].summary, /3 still await recorded ownership acceptance/);
  } finally { await s.close(); }
});

test('Records is corrected when it claims a report is saved without calling save_report', async () => {
  const s = await setup({ reportPromise: true });
  try {
    const id = s.intake.receive(s.event, 'TDEMO', 'Ev-report-promise')!;
    await s.agents.enqueue(id, async () => {});
    await s.pilot.tick(id);
    const i = s.domain.get(id);
    assert.equal(i.snapshot.reports.length, 1);
    assert.equal(i.snapshot.agents.find(a => a.id === 'records')!.status, 'done');
    assert.ok(i.snapshot.activity.some(a => a.text.includes('records tool save_report succeeded')));
    assert.ok(i.snapshot.tasks.every(t => t.status === 'assigned'));
  } finally { await s.close(); }
});

test('a specialist that only promises delivery is failed rather than reported successful', async () => {
  const s = await setup({ stubborn: true });
  try {
    const id = s.intake.receive(s.event, 'TDEMO', 'Ev-stubborn')!;
    await s.agents.enqueue(id, async () => {});
    const i = s.domain.get(id);
    assert.equal(i.notifications.length, 0);
    assert.equal(i.snapshot.agents.find(a => a.id === 'communications')!.status, 'failed');
    assert.equal(i.snapshot.agents[0].status, 'failed');
    assert.match(i.snapshot.agents[0].summary, /communications failed/);
  } finally { await s.close(); }
});

test('a failed Evidence run does not suppress permitted notifications or fabricate confirmed facts', async () => {
  const s = await setup({ failEvidence: true });
  try {
    const id = s.intake.receive(s.event, 'TDEMO', 'Ev-failed-evidence')!;
    await s.agents.enqueue(id, async () => {});
    const i = s.domain.get(id);
    assert.equal(i.notifications.length, 3);
    assert.equal(i.facts.length, 0);
    assert.equal(i.snapshot.agents[0].status, 'failed');
    assert.ok(i.snapshot.tasks.every(t => t.status === 'assigned'));
  } finally { await s.close(); }
});

test('an update does not rerun a completed procedure or resend uncertain notification deliveries', async () => {
  const s = await setup();
  try {
    const id = s.intake.receive(s.event, 'TDEMO', 'Ev-first')!;
    await s.agents.enqueue(id, async () => {});
    s.domain.mutate(id, 'Simulated uncertain receipt', i => { i.notifications[0].state = 'uncertain'; });
    const sent = s.channel.sent.length;
    s.intake.receive({ ...s.event, type: 'message', ts: '201.1', thread_ts: '200.1', text: 'SYNTHETIC: area status remains unconfirmed.' }, 'TDEMO', 'Ev-update');
    await s.agents.enqueue(id, async () => {});
    assert.equal(s.channel.sent.length, sent);
    assert.equal(s.runs.filter(r => r === 'procedure').length, 1);
    assert.equal(s.runs.filter(r => r === 'communications').length, 1);
    assert.equal(s.runs.filter(r => r === 'evidence').length, 2);
    assert.equal(s.domain.get(id).notifications[0].state, 'uncertain');
  } finally { await s.close(); }
});

test('Evidence receives only existing active image IDs, and no image tool for text-only or deleted sources', async () => {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'image-tool-test-token-123456789', VISION_ENABLED: 'true' }));
  const id = domain.create({ team: 'T', channel: 'C', ts: 'source-1', user: 'U', text: 'Synthetic text-only forklift report' }).snapshot.incidentId;
  let expected: string[] = [];
  const model: Model = { async complete(messages, tools) {
    const tool = tools.find(t => t.function.name === 'inspect_image');
    if (!expected.length) assert.equal(tool, undefined);
    else assert.deepEqual((tool!.function.parameters as { properties: { fileId: { enum: string[] } } }).properties.fileId.enum, expected);
    return messages.some(m => m.role === 'tool') ? { content: 'Reviewed available evidence.' } : call('read_incident');
  } };
  const agents = new Agents(domain, new Notifications(domain, new FixtureChannel()), model, new Media(domain));
  try {
    await agents.run(id, 'evidence', 'Review text evidence');
    domain.mutate(id, 'Synthetic attachment metadata', i => { i.attachments = [
      { id: 'F-ACTIVE', messageId: 'source-1', name: 'demo.png', mimetype: 'image/png', size: 8, source: { id: 'file:F-ACTIVE', kind: 'tool_result', label: 'Synthetic attachment' } },
      { id: 'F-REMOVED', messageId: 'source-1', name: 'removed.png', mimetype: 'image/png', size: 8, removed: true, source: { id: 'file:F-REMOVED', kind: 'tool_result', label: 'Removed attachment' } },
    ]; });
    expected = ['F-ACTIVE'];
    await agents.run(id, 'evidence', 'Review available image list');
    domain.mutate(id, 'Delete the attachment source', i => { i.messages[0].deleted = true; });
    expected = [];
    await agents.run(id, 'evidence', 'Review remaining evidence');
  } finally { await agents.drain(); store.close(); }
});
