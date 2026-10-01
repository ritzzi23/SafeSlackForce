import test from 'node:test';
import assert from 'node:assert/strict';
import type { KnownBlock } from '@slack/types';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { Agents } from '../src/agents.js';
import type { Model } from '../src/model.js';
import { FixtureChannel, Notifications } from '../src/notifications.js';
import { SlackIntake } from '../src/intake.js';
import { SummaryPublisher } from '../src/summary.js';
import { Media } from '../src/media.js';
import { publishHandoffReport } from '../src/report-action.js';

async function setup(env: NodeJS.ProcessEnv = {}, model?: Model) {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'regression-only-fixture-token-12345678', SAFESLACKFORCE_MODE: 'fixture', ...env }));
  const channel = new FixtureChannel();
  const notifications = new Notifications(domain, channel);
  const agents = new Agents(domain, notifications, model);
  const create = () => domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'SYNTHETIC: Forklift incident at Dock B' }).snapshot.incidentId;
  return { store, domain, channel, notifications, agents, create, async close() { await agents.drain(); store.close(); } };
}
const actionIds = (blocks: KnownBlock[]) => blocks.flatMap(b => b.type === 'actions' ? b.elements.flatMap(e => 'action_id' in e ? [e.action_id] : []) : []);

for (const autonomous of ['true', 'false']) test(`human task and closure controls remain usable with autonomy ${autonomous}`, async () => {
  const s = await setup({ AUTONOMOUS_RESPONSE_ENABLED: autonomous });
  const id = s.create();
  let blocks: KnownBlock[] = [];
  const publisher = new SummaryPublisher(s.domain, {
    post: async (_c, _t, _text, value) => { blocks = value; return 'summary.1'; },
    update: async (_c, _t, _text, value) => { blocks = value; },
  });
  try {
    s.domain.applyProcedure(id);
    s.notifications.enqueue(id, 'lead', 'ULEAD', 'Record your responsibility');
    await s.notifications.pump();
    await publisher.publish(id);
    for (const action of ['incident_acknowledge', 'incident_complete', 'incident_review']) {
      assert.ok(actionIds(blocks).includes(action));
      assert.ok(s.channel.sent[0].actions.some(a => a.action_id === action));
    }
    assert.ok(actionIds(blocks).includes('incident_accept_assigned'));
    assert.ok(s.domain.get(id).snapshot.tasks.every(t => t.status === 'assigned'));
    s.domain.acceptAssigned(id, 'ULEAD', s.domain.get(id).snapshot.version);
    for (const task of s.domain.get(id).snapshot.tasks) s.domain.confirm(id, task.id, 'ULEAD', 'complete', task.version, 'Explicit synthetic human confirmation');
    s.domain.report(id, 'Human confirmations recorded', ['100.1']);
    await publisher.publish(id);
    assert.ok(actionIds(blocks).includes('incident_handoff'));
    s.domain.handoff(id, 'USUPERVISOR', s.domain.get(id).snapshot.version);
    await publisher.publish(id);
    assert.ok(actionIds(blocks).includes('incident_close'));
    s.domain.close(id, 'USUPERVISOR', s.domain.get(id).snapshot.version, 'All critical work explicitly confirmed');
    await publisher.publish(id);
    assert.deepEqual(actionIds(blocks), []);
  } finally { publisher.stop(); await s.close(); }
});

test('deleting an edited Slack message invalidates evidence and cannot be undone by an older edit', async () => {
  const s = await setup();
  s.agents.coordinate = async () => 'Intake-only test';
  const intake = new SlackIntake(s.domain, s.agents);
  const message = { type: 'app_mention', channel: 'CDEMO', user: 'UREPORTER', ts: '100.1', text: 'Forklift incident at Dock B' };
  try {
    const id = intake.receive(message, 'TDEMO', 'created')!;
    await s.agents.drain();
    const edited = { ...message, text: 'Forklift incident at Dock C', edited: { ts: '200.1' } };
    intake.receive({ type: 'message', channel: 'CDEMO', subtype: 'message_changed', event_ts: '200.1', message: edited }, 'TDEMO', 'edited');
    await s.agents.drain();
    s.domain.applyProcedure(id);
    const source = s.domain.get(id).messages.at(-1)!.source.id;
    s.domain.mutate(id, 'Record evidence from edited message', i => {
      i.snapshot.location = 'Dock C'; i.locationSourceIds = [source];
      i.facts.push({ id: 'fact', text: 'Reported at Dock C', sourceIds: [source], state: 'reported' });
      i.attachments = [{ id: 'F1', messageId: '100.1', name: 'fixture.png', mimetype: 'image/png', size: 1, source: { id: 'file:F1', kind: 'tool_result', label: 'Fixture image' } }];
    });
    const deletion = { type: 'message', channel: 'CDEMO', subtype: 'message_deleted', event_ts: '300.1', deleted_ts: '100.1', previous_message: edited };
    assert.equal(intake.receive(deletion, 'TDEMO', 'deleted'), id);
    await s.agents.drain();
    assert.equal(intake.receive(deletion, 'TDEMO', 'deleted'), undefined);
    intake.receive({ type: 'message', channel: 'CDEMO', subtype: 'message_changed', event_ts: '250.1', message: { ...edited, edited: { ts: '250.1' }, text: 'Late edit' } }, 'TDEMO', 'late-edit');
    const current = s.domain.get(id);
    assert.equal(current.messages.filter(m => !m.deleted).length, 0);
    assert.equal(current.messages.at(-1)!.revision, '300.1');
    assert.equal(current.facts[0].state, 'disputed');
    assert.equal(current.attachments![0].removed, true);
    assert.equal(current.snapshot.location, 'Needs review: source corrected');
    assert.ok(current.snapshot.tasks.every(t => t.status === 'needs_review'));
    assert.throws(() => s.domain.source(current, [source]), /removed source/);
  } finally { await s.close(); }
});

test('a first mention in an existing thread preserves reply identity, attachments, edits and deletion', async () => {
  const s = await setup({ SAFESLACKFORCE_MODE: 'live', SLACK_FILES_ENABLED: 'true', SLACK_BOT_TOKEN: 'test-only-token' });
  s.agents.coordinate = async () => 'Intake-only test';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=', 'base64');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(png);
  const media = new Media(s.domain, { info: async id => ({ id, name: 'fixture.png', mimetype: 'image/png', size: png.length, url_private: 'https://files.slack.com/fixture' }) });
  const intake = new SlackIntake(s.domain, s.agents, (id, ts, files) => media.ingest(id, ts, files));
  const reply = { type: 'app_mention', channel: 'CDEMO', user: 'UREPORTER', thread_ts: '500.1', ts: '501.1', text: 'Forklift report in a reply', files: [{ id: 'F1' }] };
  try {
    const id = intake.receive(reply, 'TDEMO', 'reply-created')!;
    await s.agents.drain();
    const initial = s.domain.get(id);
    assert.equal(initial.rootTs, '500.1');
    assert.match(initial.snapshot.slackThreadUrl, /p5001$/);
    assert.equal(initial.messages[0].id, '501.1');
    assert.equal(initial.messages[0].source.id, '501.1');
    assert.match(initial.messages[0].source.url!, /p5011$/);
    assert.deepEqual(media.get(id, 'F1').bytes, png);
    assert.equal(intake.receive({ ...reply, type: 'message' }, 'TDEMO', 'reply-overlap'), undefined);
    const edit = { ...reply, text: 'Corrected reply', edited: { ts: '600.1' } };
    intake.receive({ type: 'message', channel: 'CDEMO', subtype: 'message_changed', event_ts: '600.1', message: edit }, 'TDEMO', 'reply-edit');
    await s.agents.drain();
    assert.deepEqual(s.domain.get(id).messages.filter(m => !m.deleted).map(m => m.text), ['Corrected reply']);
    intake.receive({ type: 'message', channel: 'CDEMO', subtype: 'message_deleted', event_ts: '700.1', previous_message: edit }, 'TDEMO', 'reply-delete');
    await s.agents.drain();
    assert.equal(s.domain.get(id).messages.filter(m => !m.deleted).length, 0);
    assert.throws(() => media.get(id, 'F1'), /missing or removed/);
    assert.equal(s.channel.sent.length, 0);
  } finally { globalThis.fetch = originalFetch; await s.close(); }
});

const promisesOnly: Model = { async complete(messages) {
  if (messages.some(m => m.role === 'tool')) return { content: 'The report is saved.' };
  return { content: null, tool_calls: [{ id: 'read', type: 'function', function: { name: 'read_incident', arguments: '{}' } }] };
} };
for (const autonomous of ['false', 'true']) test(`Slack report action requires a fresh save with autonomy ${autonomous}`, async () => {
  const s = await setup({ AUTONOMOUS_RESPONSE_ENABLED: autonomous }, promisesOnly);
  const id = s.create();
  try {
    s.domain.applyProcedure(id);
    const previous = s.domain.report(id, 'Old report', ['100.1']).reportId;
    s.domain.addMessage(id, { ts: '200.1', user: 'UWITNESS', text: 'New unverified observation' });
    if (autonomous === 'false') {
      await assert.rejects(publishHandoffReport(s.domain, s.agents, s.channel, id), /No report has been saved/);
      assert.equal(s.domain.get(id).snapshot.reports.at(-1)!.id, previous);
      assert.equal(s.channel.sent.length, 0, 'No success announcement for an old report');
      assert.equal(s.domain.get(id).snapshot.agents.find(a => a.id === 'records')!.status, 'failed');
    } else {
      await publishHandoffReport(s.domain, s.agents, s.channel, id);
      const current = s.domain.get(id);
      assert.notEqual(current.snapshot.reports.at(-1)!.id, previous);
      assert.deepEqual(s.domain.readiness(id).handoff.blockers, []);
      assert.match(s.store.get<{ markdown: string }>(current.snapshot.reports.at(-1)!.id)!.markdown, /AI narrative unavailable/);
      assert.equal(s.channel.sent.length, 1);
      assert.ok(s.channel.sent[0].actions.some(a => a.action_id === 'incident_handoff'));
    }
  } finally { await s.close(); }
});
