import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import bolt from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { Agents } from '../src/agents.js';
import { Notifications } from '../src/notifications.js';
import { SlackChannel } from '../src/slack.js';
import type { Model } from '../src/model.js';

async function setup(model?: Model, autonomous = false) {
  const config = readConfig({ DASHBOARD_TOKEN: 'slack-handler-fixture-token-12345678', SAFESLACKFORCE_MODE: 'fixture', AUTONOMOUS_RESPONSE_ENABLED: String(autonomous) });
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, config);
  // Use Bolt's real event/action dispatch with an in-memory receiver and no tokens.
  const receiver = { client: new EventEmitter(), init() {}, async start() {}, async stop() {} };
  const app = new bolt.App({ receiver, authorize: async () => ({ botId: 'BFIXTURE', botUserId: 'UBOT' }) });
  const posts: { text?: string; blocks?: unknown; channel: string; thread_ts?: string }[] = [];
  const errors: string[] = [];
  const views: Parameters<typeof app.client.views.open>[0]['view'][] = [];
  let failPost = false;
  app.client.chat.postMessage = async args => {
    if (failPost) throw new Error('Synthetic delivery failure');
    posts.push(args); return { ok: true, ts: `${900 + posts.length}.1` };
  };
  app.client.chat.update = async args => { posts.push(args); return { ok: true }; };
  app.client.chat.postEphemeral = async args => { errors.push('text' in args ? args.text ?? '' : ''); return { ok: true }; };
  app.client.views.open = async args => { views.push(args.view); return { ok: true }; };
  // Bypass only the production Socket Mode constructor; wire/send are unchanged.
  const channel = Object.assign(Object.create(SlackChannel.prototype) as SlackChannel, { config, app, receiver });
  const agents = new Agents(domain, new Notifications(domain, channel), model);
  channel.wire(domain, agents);
  channel.summaries!.stop(); // Publish explicitly instead of waiting on the debounce timer.
  app.error(async error => { throw error; });
  const dispatch = async (body: Record<string, unknown>) => {
    const acknowledgements: unknown[] = [];
    await app.processEvent({ body, ack: async response => { acknowledgements.push(response); } });
    return acknowledgements;
  };
  const event = async (value: Record<string, unknown>, eventId: string, team = 'TDEMO') => {
    const acknowledgements = await dispatch({ type: 'event_callback', team_id: team, event_id: eventId, event: value });
    for (const i of domain.all()) await agents.enqueue(i.snapshot.incidentId, async () => {});
    assert.equal(acknowledgements.length, 1);
  };
  const action = (actionId: string, value: object, user = 'ULEAD', team = 'TDEMO') => dispatch({
    type: 'block_actions', team: { id: team }, channel: { id: 'CDEMO' }, user: { id: user }, trigger_id: 'fixture-trigger',
    actions: [{ type: 'button', action_id: actionId, value: JSON.stringify(value) }],
  });
  const submit = (view: (typeof views)[number], note: string, user = 'ULEAD') => dispatch({
    type: 'view_submission', team: { id: 'TDEMO' }, user: { id: user },
    view: { ...view, state: { values: { confirmation: { note: { type: 'plain_text_input', value: note } } } } },
  });
  const create = () => domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'SYNTHETIC: Forklift incident at Dock B' }).snapshot.incidentId;
  return { store, domain, agents, channel, posts, errors, views, event, action, submit, create,
    failDelivery() { failPost = true; },
    async close() { channel.summaries!.stop(); await agents.drain(); store.close(); },
  };
}

test('Bolt routes a mention, ordinary thread reply, edit and deletion without reprocessing unrelated traffic', async () => {
  const s = await setup();
  const report = { type: 'app_mention', channel: 'CDEMO', user: 'UREPORTER', ts: '100.1', text: 'SYNTHETIC: forklift incident at Dock B' };
  try {
    await s.event({ ...report, channel: 'COTHER' }, 'wrong-channel');
    await s.event(report, 'wrong-team', 'TOTHER');
    await s.event({ ...report, bot_id: 'BOTHER' }, 'bot');
    await s.event({ ...report, type: 'message' }, 'untracked-message');
    assert.equal(s.domain.all().length, 0);
    await s.event(report, 'mention');
    const id = s.domain.all()[0].snapshot.incidentId;
    assert.equal(s.domain.get(id).snapshot.tasks.length, 3);
    const version = s.domain.get(id).snapshot.version;
    await s.event(report, 'mention');
    await s.event({ ...report, type: 'message' }, 'overlapping-message');
    assert.equal(s.domain.get(id).snapshot.version, version);
    const reply = { type: 'message', channel: 'CDEMO', user: 'UWITNESS', thread_ts: '100.1', ts: '200.1', text: 'SYNTHETIC: lead is checking Dock B' };
    await s.event(reply, 'ordinary-reply');
    assert.equal(s.domain.get(id).messages.at(-1)!.text, reply.text);
    const edited = { ...reply, text: 'SYNTHETIC: correction, lead has not arrived', edited: { ts: '300.1' } };
    await s.event({ type: 'message', channel: 'CDEMO', subtype: 'message_changed', event_ts: '300.1', message: edited }, 'edit');
    assert.equal(s.domain.get(id).messages.filter(m => !m.deleted).at(-1)!.text, edited.text);
    await s.event({ type: 'message', channel: 'CDEMO', subtype: 'message_deleted', event_ts: '400.1', deleted_ts: reply.ts, previous_message: edited }, 'delete');
    assert.deepEqual(s.domain.get(id).messages.filter(m => !m.deleted).map(m => m.id), ['100.1']);
    assert.equal(s.domain.get(id).messages.at(-1)!.revision, '400.1');
    assert.ok(s.posts.every(p => p.channel === 'CDEMO' && p.thread_ts === '100.1'));
  } finally { await s.close(); }
});

test('autonomous Slack summary buttons and modals complete ownership, human confirmation, fresh report, handoff and closure through Bolt', async () => {
  const s = await setup(undefined, true);
  const id = s.create();
  const click = async (actionId: string, user: string, taskId?: string) => {
    await s.channel.summaries!.publish(id);
    const buttons = (s.posts.at(-1)!.blocks as KnownBlock[]).flatMap(b => b.type === 'actions' ? b.elements : []);
    const button = buttons.find(b => b.type === 'button' && b.action_id === actionId && (!taskId || JSON.parse(b.value!).taskId === taskId));
    assert.ok(button?.type === 'button' && button.value, `Missing ${actionId} button`);
    assert.deepEqual(await s.action(actionId, JSON.parse(button.value), user), [undefined]);
  };
  try {
    s.domain.applyProcedure(id);
    await click('incident_accept_assigned', 'ULEAD');
    assert.ok(s.domain.get(id).snapshot.tasks.every(t => t.status === 'acknowledged'));
    await click('incident_review', 'ULEAD', 'area');
    assert.equal(s.domain.get(id).snapshot.tasks.find(t => t.id === 'area')!.status, 'needs_review');
    for (const task of s.domain.get(id).snapshot.tasks) {
      await click('incident_complete', 'ULEAD', task.id);
      assert.deepEqual(await s.submit(s.views.at(-1)!, 'Explicit synthetic human confirmation'), [undefined]);
    }
    await click('incident_report', 'USUPERVISOR');
    assert.equal(s.domain.get(id).snapshot.reports.length, 1);
    await click('incident_handoff', 'USUPERVISOR');
    assert.equal(s.domain.get(id).snapshot.status, 'handed_over');
    await click('incident_close', 'USUPERVISOR');
    assert.deepEqual(await s.submit(s.views.at(-1)!, 'All synthetic required work confirmed', 'USUPERVISOR'), [undefined]);
    assert.equal(s.domain.get(id).snapshot.status, 'closed');
    assert.deepEqual(s.errors, []);
  } finally { await s.close(); }
});

test('Slack actions reject wrong workspaces, unauthorized actors and stale task versions', async t => {
  const s = await setup();
  const id = s.create();
  t.mock.method(console, 'error', () => {});
  try {
    s.domain.applyProcedure(id);
    const value = { incidentId: id, taskId: 'lead', version: 1 };
    const version = s.domain.get(id).snapshot.version;
    await s.action('incident_acknowledge', value, 'ULEAD', 'TOTHER');
    await s.action('incident_acknowledge', value, 'UWITNESS');
    assert.equal(s.domain.get(id).snapshot.version, version);
    assert.match(s.errors.at(-1)!, /Not authorized/);
    await s.action('incident_acknowledge', value);
    await s.action('incident_acknowledge', value);
    assert.match(s.errors.at(-1)!, /Task changed/);
    assert.equal(s.domain.get(id).snapshot.tasks[0].version, 2);
    await s.action('incident_report', { incidentId: id }, 'UWITNESS');
    assert.match(s.errors.at(-1)!, /Supervisor required/);
    await s.action('incident_close', { incidentId: id, version }, 'UWITNESS');
    assert.equal(s.domain.get(id).snapshot.reports.length, 0);
    assert.equal(s.views.length, 0);
  } finally { await s.close(); }
});

test('Slack confirmation acknowledges once and retains saved work when its notification fails', async t => {
  const s = await setup();
  const id = s.create();
  t.mock.method(console, 'error', () => {});
  try {
    s.domain.applyProcedure(id);
    await s.action('incident_complete', { incidentId: id, taskId: 'lead', version: 1 });
    const view = s.views.at(-1)!;
    const invalid = await s.submit(view, '');
    assert.equal(invalid.length, 1);
    assert.match(JSON.stringify(invalid[0]), /explicit confirmation note/);
    assert.equal(s.domain.get(id).snapshot.tasks[0].status, 'assigned');
    s.failDelivery();
    assert.deepEqual(await s.submit(view, 'I accepted synthetic coordination'), [undefined]);
    assert.equal(s.domain.get(id).snapshot.tasks[0].status, 'completed');
    const stale = await s.submit(view, 'Retried submission');
    assert.equal(stale.length, 1);
    assert.match(JSON.stringify(stale[0]), /Task changed/);
  } finally { await s.close(); }
});

test('Slack report handler gives the supervisor an error when the model never saves a fresh report', async t => {
  const model: Model = { async complete(messages) {
    if (messages.some(m => m.role === 'tool')) return { content: 'The report is saved.' };
    return { content: null, tool_calls: [{ id: 'read', type: 'function', function: { name: 'read_incident', arguments: '{}' } }] };
  } };
  const s = await setup(model);
  const id = s.create();
  t.mock.method(console, 'error', () => {});
  try {
    s.domain.applyProcedure(id);
    s.domain.report(id, 'Earlier report', ['100.1']);
    s.domain.addMessage(id, { ts: '200.1', user: 'UWITNESS', text: 'New synthetic observation' });
    assert.deepEqual(await s.action('incident_report', { incidentId: id }, 'USUPERVISOR'), [undefined]);
    assert.equal(s.domain.get(id).snapshot.reports.length, 1);
    assert.equal(s.posts.length, 0);
    assert.match(s.errors.at(-1)!, /Report preparation or delivery failed/);
    assert.equal(s.domain.get(id).snapshot.agents.find(a => a.id === 'records')!.status, 'failed');
  } finally { await s.close(); }
});
