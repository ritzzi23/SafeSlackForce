import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessSchema } from '@safeslackforce/contracts';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { readConfig } from '../src/config.js';
import { createHttp } from '../src/http.js';
import { Agents } from '../src/agents.js';
import { Notifications, FixtureChannel } from '../src/notifications.js';
import { Budget } from '../src/budget.js';
import { Research } from '../src/research.js';

async function setup() {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ SAFESLACKFORCE_MODE: 'fixture', DASHBOARD_TOKEN: 'test-only-readiness-token-123456789' }));
  const id = domain.create({ team: 'T', channel: 'C', ts: '1', user: 'U', text: 'Forklift incident at Dock B' }).snapshot.incidentId;
  domain.applyProcedure(id);
  return { store, domain, id };
}

test('readiness is read-only; open owned tasks may transfer but cannot close', async () => {
  const { store, domain, id } = await setup();
  try {
    const before = JSON.stringify(domain.get(id));
    const initial = readinessSchema.parse(domain.readiness(id));
    assert.ok(initial.handoff.blockers.some(b => b.code === 'REPORT_MISSING'));
    assert.equal(JSON.stringify(domain.get(id)), before);
    domain.report(id, 'Outstanding owned work', ['1']);
    assert.deepEqual(domain.readiness(id).handoff.blockers, []);
    assert.throws(() => domain.handoff(id, 'UUNKNOWN', domain.get(id).snapshot.version), /Supervisor required/);
    domain.handoff(id, 'USUPERVISOR', domain.get(id).snapshot.version);
    assert.equal(domain.readiness(id).handoff.state, 'done');
    assert.ok(domain.readiness(id).closure.blockers.some(b => b.code === 'CRITICAL_TASKS_OPEN'));
    assert.throws(() => domain.close(id, 'USUPERVISOR', domain.get(id).snapshot.version, 'Done'), /Critical tasks/);
  } finally { store.close(); }
});

test('stale reports and missing owners explain the same guards enforced on handoff', async () => {
  const { store, domain, id } = await setup();
  try {
    domain.report(id, 'Draft', ['1']);
    domain.mutate(id, 'Unassign task', i => { i.snapshot.tasks[0].owner = null; });
    assert.deepEqual(domain.readiness(id).handoff.blockers.map(b => b.code), ['REPORT_STALE', 'OPEN_TASKS_UNOWNED']);
    assert.throws(() => domain.handoff(id, 'USUPERVISOR', domain.get(id).snapshot.version), /stale/);
    domain.report(id, 'Current', ['1']);
    assert.throws(() => domain.handoff(id, 'USUPERVISOR', domain.get(id).snapshot.version), /owners/);
  } finally { store.close(); }
});

test('delivery never invents acknowledgement, review or physical completion', async () => {
  const { store, domain, id } = await setup();
  try {
    domain.mutate(id, 'Test receipts', i => {
      i.notifications.push({ id: 'n', taskId: 'lead', recipient: 'ULEAD', text: 'Accept', state: 'sent', messageId: 'receipt', dueAt: 0, followup: false });
      i.notifications.push({ id: 'u', taskId: 'area', recipient: 'ULEAD', text: 'Check', state: 'uncertain', dueAt: 0, followup: false });
    });
    let tasks = domain.readiness(id).tasks;
    assert.equal(tasks[0].status, 'assigned');
    assert.equal(tasks[0].notifications[0].acknowledgedBy, null);
    assert.equal(tasks[1].notifications[0].receipt, null);
    domain.confirm(id, 'lead', 'ULEAD', 'acknowledge', 1, 'Accepted');
    domain.confirm(id, 'area', 'ULEAD', 'review', 1, 'Corrected location needs review');
    tasks = domain.readiness(id).tasks;
    assert.equal(tasks[0].status, 'acknowledged');
    assert.match(tasks[0].explanation, /completion has not/);
    assert.equal(tasks[1].explanation, 'Corrected location needs review');
    assert.equal(tasks[0].notifications[0].acknowledgedBy, 'ULEAD');
  } finally { store.close(); }
});

test('cancelled critical task blocks closure; completed critical work still requires human note', async () => {
  const { store, domain, id } = await setup();
  try {
    domain.report(id, 'Handoff', ['1']);
    domain.handoff(id, 'USUPERVISOR', domain.get(id).snapshot.version);
    domain.mutate(id, 'Cancelled critical fixture', i => { i.snapshot.tasks[0].status = 'cancelled'; });
    assert.ok(domain.readiness(id).closure.blockers[0].taskIds.includes('lead'));
    for (const t of domain.get(id).snapshot.tasks) domain.confirm(id, t.id, 'USUPERVISOR', 'complete', t.version, 'Synthetic human confirmation');
    assert.deepEqual(domain.readiness(id).closure.blockers, []);
    assert.throws(() => domain.close(id, 'USUPERVISOR', domain.get(id).snapshot.version), /note/);
    domain.close(id, 'USUPERVISOR', domain.get(id).snapshot.version, 'Synthetic closure');
    assert.equal(domain.readiness(id).closure.state, 'done');
  } finally { store.close(); }
});

test('readiness endpoint requires dashboard authentication and returns versioned data', async () => {
  const { store, domain, id } = await setup();
  const notifications = new Notifications(domain, new FixtureChannel());
  const budget = new Budget(store);
  const app = createHttp(domain, new Agents(domain, notifications), budget, new Research(domain.config, budget, store));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/incidents/${id}/readiness`;
    assert.equal((await fetch(url)).status, 401);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${domain.config.token}` } });
    assert.equal(response.status, 200);
    const data = readinessSchema.parse(await response.json());
    assert.equal(data.version, domain.get(id).snapshot.version);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
