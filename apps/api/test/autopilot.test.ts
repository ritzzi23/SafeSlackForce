import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { readConfig } from '../src/config.js';
import { Agents } from '../src/agents.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { Autopilot } from '../src/autopilot.js';

async function setup(limit = 4) {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'autopilot-test-token-123456789' }));
  const agents = new Agents(domain, new Notifications(domain, new FixtureChannel()));
  const pilot = new Autopilot(domain, agents, limit, 60000);
  const id = domain.create({ team: 'T', channel: 'C', ts: '1', user: 'U', text: 'Forklift at Loading Dock B' }).snapshot.incidentId;
  domain.applyProcedure(id); pilot.start();
  return { store, domain, agents, pilot, id, close() { pilot.stop(); store.close(); } };
}
test('automatic report is prepared without human task completion, then refreshed after ownership changes', async () => {
  const s = await setup();
  try {
    await s.pilot.tick(s.id);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 1);
    assert.ok(s.domain.get(s.id).snapshot.tasks.every(t => t.status === 'assigned'));
    await s.pilot.tick(s.id);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 1);
    s.domain.acceptAssigned(s.id, 'ULEAD', s.domain.get(s.id).snapshot.version);
    await s.pilot.tick(s.id);
    const i = s.domain.get(s.id);
    assert.equal(i.snapshot.reports.length, 2);
    assert.ok(i.snapshot.tasks.every(t => t.status === 'acknowledged'));
    assert.equal(i.snapshot.status, 'handoff_ready');
    assert.equal(i.acceptedBy, undefined);
  } finally { s.close(); }
});
test('batch ownership cannot claim another person’s tasks, bypass review or use stale state', async () => {
  const s = await setup();
  try {
    assert.throws(() => s.domain.acceptAssigned(s.id, 'USTRANGER', s.domain.get(s.id).snapshot.version), /No unacknowledged/);
    const old = s.domain.get(s.id).snapshot.version;
    s.domain.confirm(s.id, 'area', 'ULEAD', 'review', 1, 'Need review');
    assert.throws(() => s.domain.acceptAssigned(s.id, 'ULEAD', old), /changed|stale/i);
    s.domain.acceptAssigned(s.id, 'ULEAD', s.domain.get(s.id).snapshot.version);
    assert.equal(s.domain.get(s.id).snapshot.tasks.find(t => t.id === 'area')!.status, 'needs_review');
    assert.equal(s.domain.get(s.id).snapshot.tasks.filter(t => t.status === 'completed').length, 0);
  } finally { s.close(); }
});
test('automatic allowance survives a new scheduler instance and does not retry unchanged failures', async () => {
  const s = await setup(1);
  try {
    s.agents.run = async () => { throw new Error('Provider unavailable'); };
    await s.pilot.tick(s.id);
    await s.pilot.tick(s.id);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 0);
    assert.equal(s.store.get<{ attempts: number }>(`autopilot-report-${s.id}`)!.attempts, 1);
    s.pilot.stop();
    const next = new Autopilot(s.domain, s.agents, 1, 60000); next.start();
    try {
      s.domain.acceptAssigned(s.id, 'ULEAD', s.domain.get(s.id).snapshot.version);
      await next.tick(s.id);
      assert.equal(s.store.get<{ status: string }>(`autopilot-report-${s.id}`)!.status, 'capped');
      assert.equal(s.store.get<{ attempts: number }>(`autopilot-report-${s.id}`)!.attempts, 1);
    } finally { next.stop(); }
  } finally { s.close(); }
});
test('autopilot never reopens handed-over incidents and stop prevents work', async () => {
  const s = await setup();
  try {
    s.pilot.stop(); await s.pilot.tick(s.id);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 0);
    s.pilot.start(); await s.pilot.tick(s.id);
    s.domain.handoff(s.id, 'USUPERVISOR', s.domain.get(s.id).snapshot.version);
    s.domain.confirm(s.id, 'lead', 'ULEAD', 'complete', 1, 'Accepted coordination');
    await s.pilot.tick(s.id);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 1);
    assert.equal(s.domain.get(s.id).snapshot.status, 'handed_over');
  } finally { s.close(); }
});
test('concurrent ticks produce one report and unowned work remains blocked', async () => {
  const s = await setup();
  try {
    s.domain.mutate(s.id, 'Unowned fixture', i => { i.snapshot.tasks[0].owner = null; });
    await s.pilot.tick(s.id); assert.equal(s.domain.get(s.id).snapshot.reports.length, 0);
    s.domain.mutate(s.id, 'Restore owner', i => { i.snapshot.tasks[0].owner = { slackUserId: 'ULEAD', name: 'Lead' }; });
    await Promise.all([s.pilot.tick(s.id), s.pilot.tick(s.id)]);
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 1);
  } finally { s.close(); }
});
test('startup and connection-only events do not spend on old incidents; operational updates do', async () => {
  const s = await setup(); s.pilot.stop();
  const pilot = new Autopilot(s.domain, s.agents, 4, 10); pilot.start();
  try {
    s.domain.setConnection('connected');
    await new Promise(r => setTimeout(r, 30));
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 0);
    s.domain.acceptAssigned(s.id, 'ULEAD', s.domain.get(s.id).snapshot.version);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(s.domain.get(s.id).snapshot.reports.length, 1);
  } finally { pilot.stop(); await s.agents.drain(); s.close(); }
});
