import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { AmbiguousWorkspace, workspaceStatus } from '../src/workspace.js';

test('incident task states map onto Ambiguous board columns', () => {
  assert.equal(workspaceStatus('assigned'), 'todo');
  assert.equal(workspaceStatus('acknowledged'), 'in_progress');
  assert.equal(workspaceStatus('needs_review'), 'blocked');
  assert.equal(workspaceStatus('completed'), 'done');
});

test('Ambiguous Workspace mirror creates each task once, patches status changes and publishes reports once', async () => {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'test-only-workspace-token-1234567', INCIDENTOS_MODE: 'fixture' } as any));
  const id = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'Forklift incident at Dock B' }).snapshot.incidentId;
  domain.applyProcedure(id);
  const calls: { method: string; url: string; body: any }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); calls.push({ method: String(init.method), url, body });
    const payload = url.endsWith('/api/documents') ? { document: { id: 'doc-1' } } : { task: { id: `remote-${calls.length}` } };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
  const ws = new AmbiguousWorkspace(domain, 'ak_test', fake, 0);
  const tasks = domain.get(id).snapshot.tasks.length;
  assert.ok(tasks > 0);
  await ws.sync(id); await ws.sync(id);
  assert.equal(calls.filter(c => c.method === 'POST').length, tasks, 'each task created exactly once');
  assert.ok(calls.every(c => c.body.title?.startsWith(`[${id}]`)));
  const task = domain.get(id).snapshot.tasks[0];
  domain.confirm(id, task.id, domain.config.supervisors[0], 'acknowledge', task.version, '');
  await ws.sync(id);
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 1);
  assert.equal(calls.find(c => c.method === 'PATCH')!.body.status, 'in_progress');
  domain.report(id, 'Synthetic handoff', [domain.get(id).messages[0].source.id]);
  await ws.sync(id); await ws.sync(id);
  assert.equal(calls.filter(c => c.url.endsWith('/api/documents')).length, 1, 'report published once');
  assert.ok(domain.get(id).snapshot.activity.some(a => a.text.includes('Ambiguous Workspace')));
});
