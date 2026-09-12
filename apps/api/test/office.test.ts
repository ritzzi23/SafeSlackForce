import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { OfficeDirectory } from '../src/office.js';
import { seedOffice } from '../src/seed-office.js';
import { Incidents } from '../src/domain.js';
import { readConfig } from '../src/config.js';
import { Agents } from '../src/agents.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { Budget } from '../src/budget.js';
import { Research } from '../src/research.js';
import { createHttp } from '../src/http.js';
import type { Model } from '../src/model.js';

async function setup() {
  const pub = await Store.open(':memory:'); const priv = await Store.open(':memory:');
  seedOffice(pub, priv); return { pub, priv, directory: new OfficeDirectory(pub) };
}
test('seed creates referenced office categories and isolated restricted records without overwrites', async () => {
  const { pub, priv, directory } = await setup();
  try {
    const summary = directory.summary();
    assert.ok(Object.values(summary.counts).every(n => n > 0));
    assert.equal(priv.list('restricted-office-record').length, 6);
    assert.equal(pub.list('restricted-office-record').length, 0);
    assert.throws(() => new OfficeDirectory(priv), /incompatible/);
    assert.throws(() => seedOffice(pub, priv), /not an empty/);
    assert.equal(priv.list('restricted-office-record').length, 6);
  } finally { pub.close(); priv.close(); }
});
test('bounded searches cannot fetch restricted categories or member identifiers', async () => {
  const { pub, priv, directory } = await setup();
  try {
    assert.throws(() => directory.search({ category: 'medical_records' }));
    assert.throws(() => directory.search({ limit: 10000 }));
    assert.equal(directory.search({ query: 'DEMO-NOT-VALID' }).total, 0);
    assert.equal(directory.source('restricted:medical-1'), undefined);
    assert.equal(directory.search({ category: 'employees', query: 'Site director' }).total, 1);
    assert.match(directory.search({ category: 'call_logs' }).records[0].details.provenance as string, /not an actual call/);
  } finally { pub.close(); priv.close(); }
});
test('office sources are usable references but never grant Slack recipient authority', async () => {
  const { pub, priv, directory } = await setup();
  const store = await Store.open(':memory:');
  try {
    const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'office-test-token-12345678900' }), directory);
    const i = domain.create({ team: 'T', channel: 'C', ts: '1', user: 'U', text: 'Forklift at Dock B' });
    assert.match(domain.source(i, ['office:policy-privacy'])[0].label, /SYNTHETIC/);
    assert.throws(() => domain.source(i, ['restricted:medical-1']), /Unknown/);
    domain.applyProcedure(i.snapshot.incidentId);
    const notifications = new Notifications(domain, new FixtureChannel());
    assert.throws(() => notifications.enqueue(i.snapshot.incidentId, 'lead', 'office:maya-sen', 'Hello'), /recipient|roster|allowed|configured/i);
  } finally { pub.close(); priv.close(); store.close(); }
});
test('office HTTP routes require authentication and reject private category queries', async () => {
  const { pub, priv, directory } = await setup(); const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'office-test-token-12345678900' }), directory);
  const budget = new Budget(store);
  const app = createHttp(domain, new Agents(domain, new Notifications(domain, new FixtureChannel())), budget, new Research(domain.config, budget, store));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/office`;
    assert.equal((await fetch(url)).status, 401);
    const headers = { Authorization: `Bearer ${domain.config.token}` };
    assert.equal((await fetch(url, { headers })).status, 200);
    assert.equal((await fetch(`${url}/records?category=medical_records`, { headers })).status, 400);
    const res = await fetch(`${url}/records?category=policies`, { headers });
    assert.equal(res.status, 200); assert.equal((await res.json() as { synthetic: boolean }).synthetic, true);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); pub.close(); priv.close(); store.close(); }
});
test('seed persists across restart with private file permissions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'office-db-test-'));
  try {
    const a = join(dir, 'public.sqlite'), b = join(dir, 'restricted.sqlite');
    const pub = await Store.open(a), priv = await Store.open(b); seedOffice(pub, priv); pub.close(); priv.close();
    assert.equal(statSync(b).mode & 0o777, 0o600);
    const reopened = await Store.open(a);
    try { assert.equal(new OfficeDirectory(reopened).search({ category: 'employees' }).total, 12); } finally { reopened.close(); }
  } finally { rmSync(dir, { recursive: true }); }
});

test('agent executes office lookup with source references through a scripted, no-network model', async () => {
  const { pub, priv, directory } = await setup(); const store = await Store.open(':memory:');
  try {
    const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'office-test-token-12345678900' }), directory);
    const id = domain.create({ team: 'T', channel: 'C', ts: '1', user: 'U', text: 'Where is the demo privacy policy?' }).snapshot.incidentId;
    let round = 0;
    const model: Model = { async complete(messages, tools) {
      assert.ok(tools.some(t => t.function.name === 'read_office'));
      round++;
      if (round < 3) return { content: null, tool_calls: [{ id: `lookup-${round}`, type: 'function', function: { name: round === 1 ? 'read_incident' : 'read_office', arguments: round === 1 ? '{}' : JSON.stringify({ category: 'policies', query: 'privacy' }) } }] };
      const last = messages.at(-1)?.content ?? '';
      assert.match(last, /office:policy-privacy/);
      assert.doesNotMatch(last, /DEMO-NOT-VALID|restricted:medical/);
      return { content: 'Synthetic policy reference: office:policy-privacy. Keep clinical details out of Slack.' };
    } };
    await new Agents(domain, new Notifications(domain, new FixtureChannel()), model).process(id);
    assert.equal(round, 3);
    assert.ok(domain.get(id).snapshot.activity.some(a => a.sources.some(s => s.id === 'office:policy-privacy')));
  } finally { pub.close(); priv.close(); store.close(); }
});
