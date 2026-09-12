import 'dotenv/config';
// Live check: mirrors one in-memory SYNTHETIC incident into Ambiguous Workspace (tasks, status, report doc).
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { AmbiguousWorkspace } from '../src/workspace.js';
const store = await Store.open(':memory:');
const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'smoke-only-token-123456789012345', INCIDENTOS_MODE: 'fixture' } as any));
const id = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '1.1', user: 'UREPORTER', text: 'SYNTHETIC DEMO: Forklift incident at Loading Dock B. One person reported injured.' }).snapshot.incidentId;
domain.applyProcedure(id);
const ws = new AmbiguousWorkspace(domain, process.env.AMBIGUOUS_API_KEY!);
await ws.sync(id);
const t = domain.get(id).snapshot.tasks[0];
domain.confirm(id, t.id, domain.config.supervisors[0], 'acknowledge', t.version, '');
await ws.sync(id);
domain.report(id, 'Synthetic handoff for the Ambiguous Workspace check', [domain.get(id).messages[0].source.id]);
await ws.sync(id);
for (const a of domain.get(id).snapshot.activity.filter(a => a.text.includes('Ambiguous'))) console.log('activity:', a.text);
console.log('mirrored entities:', store.list<any>('ambiguous-task').length, 'tasks,', store.list<any>('ambiguous-doc').length, 'docs');
