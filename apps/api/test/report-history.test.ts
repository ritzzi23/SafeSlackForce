import test from 'node:test';
import assert from 'node:assert/strict';
import { historyPage } from '../src/history.js';
import { Agents } from '../src/agents.js';
import { Incidents } from '../src/domain.js';
import { Store } from '../src/store.js';
import { readConfig } from '../src/config.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { MODEL_CONTEXT_LIMIT, type Completion, type Model } from '../src/model.js';
import type { IncidentSnapshot } from '@safeslackforce/contracts';

const call = (name: string, args = {}): Completion => ({ content: null, tool_calls: [{ id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const decode = (page: ReturnType<typeof historyPage>) => page.events.map(([id, timestamp, text, refs]) => ({ id, timestamp, text, sources: refs.map(index => page.sources[index]) }));

test('bounded history pages preserve all event and source fields, including changing confirmation labels', () => {
  const history: IncidentSnapshot['activity'] = Array.from({ length: 160 }, (_, n) => ({
    id: `event-${n}`, timestamp: new Date(n * 1000).toISOString(), text: `Reported event ${n}: ${'detail '.repeat(15)}`,
    sources: [{ id: 'shared-source', kind: 'human_confirmation', label: `Specific confirmation ${n % 3}`, url: 'https://example.com/source' }],
  }));
  const restored: typeof history = [];
  let offset: number | null = 0, pages = 0;
  while (offset !== null) {
    const page = historyPage(history, offset, 2000);
    assert.ok(JSON.stringify(page).length <= 2000);
    assert.ok(page.nextOffset === null || page.nextOffset > offset);
    restored.push(...decode(page)); offset = page.nextOffset; pages++;
  }
  assert.ok(pages > 1);
  assert.deepEqual(restored, history);
  assert.throws(() => historyPage([{ ...history[0], text: 'x'.repeat(36001) }], 0), /bounded report context/);
});

async function setup(autonomous = false) {
  const store = await Store.open(':memory:');
  const config = readConfig({ DASHBOARD_TOKEN: 'report-history-fixture-token', AUTONOMOUS_RESPONSE_ENABLED: String(autonomous) });
  const domain = new Incidents(store, config);
  const id = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'SYNTHETIC forklift at Dock B' }).snapshot.incidentId;
  const notifications = new Notifications(domain, new FixtureChannel());
  return { store, domain, id, notifications };
}

test('a long report reads every timeline entry and saves within the default five model rounds', async () => {
  const s = await setup();
  let calls = 0;
  const seen: IncidentSnapshot['activity'] = [];
  try {
    s.domain.mutate(s.id, 'Synthetic long history prepared', i => {
      for (let n = 0; n < 190; n++) i.snapshot.activity.push({
        id: `long-${n}`, timestamp: new Date(n * 1000).toISOString(),
        text: `Historical attempt ${n}: ${'reported coordination detail; '.repeat(9)}`,
        sources: [{ id: '100.1', kind: 'slack_message', label: 'Initial report', url: 'https://example.com/thread' }],
      });
    });
    const model: Model = { async complete(messages) {
      calls++;
      assert.ok(JSON.stringify(messages).length <= MODEL_CONTEXT_LIMIT);
      const results = messages.filter(m => m.role === 'tool');
      if (!results.length) return call('read_incident');
      const last = JSON.parse(results.at(-1)!.content!);
      assert.equal(last.error, undefined);
      if (!('nextOffset' in last)) return call('read_history', { offset: 0 });
      seen.push(...decode(last));
      if (last.nextOffset !== null) return call('read_history', { offset: last.nextOffset });
      assert.deepEqual(seen, s.domain.get(s.id).snapshot.activity);
      return call('save_report', { summary: 'Full timeline reviewed. Synthetic physical tasks remain unconfirmed.', sources: ['100.1'] });
    } };
    const agents = new Agents(s.domain, s.notifications, model);
    await agents.prepareReport(s.id, 'Prepare a sourced report');
    assert.ok(calls <= 5);
    const current = s.domain.get(s.id);
    assert.equal(current.snapshot.reports.length, 1);
    assert.equal(current.snapshot.agents.find(a => a.id === 'records')!.status, 'done');
    const report = s.store.get<{ markdown: string }>(current.snapshot.reports[0].id)!;
    assert.match(report.markdown, /Historical attempt 189/);
    assert.doesNotMatch(report.markdown, /AI narrative unavailable/);
  } finally { s.store.close(); }
});

test('rereading changed incident state cannot authorize a report using the older timeline', async () => {
  const s = await setup();
  let round = 0;
  try {
    const model: Model = { async complete(messages) {
      round++;
      if (round === 1) return call('read_incident');
      if (round === 2) return call('read_history', { offset: 0 });
      if (round === 3) {
        s.domain.addMessage(s.id, { ts: '200.1', user: 'UWITNESS', text: 'SYNTHETIC correction: the location is Dock C' });
        return { content: null, tool_calls: [...call('read_incident').tool_calls!, ...call('save_report', { summary: 'Stale draft', sources: ['100.1'] }).tool_calls!] };
      }
      if (round === 4) {
        const last = JSON.parse(messages.filter(m => m.role === 'tool').at(-1)!.content!);
        assert.match(last.error, /current timeline pages/);
        assert.equal(s.domain.get(s.id).snapshot.reports.length, 0);
        return call('read_history', { offset: 0 });
      }
      return call('save_report', { summary: 'Current correction: Dock C reported; no physical confirmation.', sources: ['200.1'] });
    } };
    const agents = new Agents(s.domain, s.notifications, model);
    await agents.prepareReport(s.id, 'Prepare current report');
    assert.equal(round, 5);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 1);
  } finally { s.store.close(); }
});

test('oversized timeline entries use the labelled structured fallback without truncating evidence', async () => {
  const s = await setup(true);
  try {
    s.domain.mutate(s.id, `Large historical note ${'x'.repeat(37000)} END-OF-NOTE`, () => []);
    const model: Model = { async complete(messages) {
      const results = messages.filter(m => m.role === 'tool');
      if (!results.length) return call('read_incident');
      if (results.length === 1) return call('read_history', { offset: 0 });
      const last = JSON.parse(results.at(-1)!.content!);
      if (last.nextOffset != null) return call('read_history', { offset: last.nextOffset });
      return { content: 'Unable to read the bounded history page.' };
    } };
    const agents = new Agents(s.domain, s.notifications, model);
    await agents.prepareReport(s.id, 'Prepare current report');
    const current = s.domain.get(s.id);
    const report = s.store.get<{ markdown: string }>(current.snapshot.reports[0].id)!;
    assert.match(report.markdown, /AI narrative unavailable/);
    assert.match(report.markdown, /x{37000} END-OF-NOTE/);
  } finally { s.store.close(); }
});
