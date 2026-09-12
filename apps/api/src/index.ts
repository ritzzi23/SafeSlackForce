import { readConfig } from './config.js';
import { Store } from './store.js';
import { Incidents } from './domain.js';
import { Budget } from './budget.js';
import { OpenRouter } from './model.js';
import { Research } from './research.js';
import { FixtureChannel, Notifications } from './notifications.js';
import { Agents } from './agents.js';
import { SlackChannel } from './slack.js';
import { createHttp } from './http.js';
import { Media } from './media.js';
import { existsSync } from 'node:fs';
import { OfficeDirectory } from './office.js';
import { Autopilot } from './autopilot.js';
import { AmbiguousWorkspace } from './workspace.js';

const config = readConfig();
if (config.mode === 'live' && [config.apiKey, config.model, config.appToken, config.botToken].some(x => !x)) throw new Error('Live mode requires OpenRouter model/key and both Slack tokens');
if (config.mode === 'live' && [config.team, config.channel, config.lead, config.backup, ...config.supervisors].some(x => /^(TDEMO|CDEMO|ULEAD|UBACKUP|USUPERVISOR)$/.test(x))) throw new Error('Replace demo Slack IDs with actual workspace, channel and role IDs for live mode');
const store = await Store.open(config.database);
if (config.officeDemoEnabled && !existsSync('data/office-demo.sqlite')) throw new Error('Run npm run seed:office before enabling OFFICE_DEMO_ENABLED.');
const officeStore = config.officeDemoEnabled ? await Store.open('data/office-demo.sqlite') : undefined;
const domain = new Incidents(store, config, officeStore ? new OfficeDirectory(officeStore) : undefined); const budget = new Budget(store);
const channel = config.mode === 'live' ? new SlackChannel(config) : new FixtureChannel();
const notifications = new Notifications(domain, channel); notifications.recover();
const model = config.mode === 'live' ? new OpenRouter(config, budget) : undefined;
const media = new Media(domain, channel instanceof SlackChannel ? { info: async file => {
  const result = await channel.app.client.files.info({ file }); if (!result.ok) throw new Error('Slack file info failed'); return result.file;
} } : undefined, model);
const agents = new Agents(domain, notifications, model, media);
const autopilot = new Autopilot(domain, agents);
for (const r of store.list<any>('request').filter(r => r.status === 'pending')) store.transaction(() => store.put(`request-${r.requestId}`, 'request', { ...r, status: 'failed', error: 'Server restarted during this request' }));
for (const r of store.list<any>('transcript').filter(r => r.status === 'pending')) store.transaction(() => store.put(`transcript-${r.requestId}`, 'transcript', { ...r, status: 'uncertain', error: 'Server restarted; inspect Slack before resubmitting' }));
for (const job of store.list<any>('slack-job').filter(j => ['pending', 'running'].includes(j.state))) {
  store.transaction(() => store.put(job.id, 'slack-job', { ...job, state: 'failed' }));
  domain.agent(job.incidentId, 'commander', 'failed', 'Server restarted during Slack work; supervisor can retry coordination');
}
for (const i of domain.all()) for (const a of i.snapshot.agents) if (a.status === 'working') domain.agent(i.snapshot.incidentId, a.id, 'failed', 'Server restarted during agent work');
if (channel instanceof SlackChannel) channel.wire(domain, agents, (id, ts, files) => media.ingest(id, ts, files));
autopilot.start();
const workspace = config.ambiguousEnabled && config.ambiguousKey ? new AmbiguousWorkspace(domain, config.ambiguousKey) : undefined;
workspace?.start();
const app = createHttp(domain, agents, budget, new Research(config, budget, store), media);
const server = app.listen(config.port, config.host, () => console.log(`SafeSlackForce API: http://${config.host}:${config.port} (${config.mode})`));
if (channel instanceof SlackChannel) await channel.start(domain).catch(() => { domain.setConnection('disconnected'); console.error('Slack startup failed. Check credentials and restart; dashboard remains available.'); });
const timer = setInterval(() => { void notifications.pump().catch(() => console.error('Notification processing failed')); }, 1000);
let stopping = false;
const shutdown = async () => {
  if (stopping) return; stopping = true; clearInterval(timer); autopilot.stop(); workspace?.stop();
  const timeout = setTimeout(() => { console.error('Shutdown timed out; interrupted work will be visible after restart'); process.exit(1); }, 10000);
  server.close();
  await agents.drain();
  if (channel instanceof SlackChannel) await channel.stop(domain);
  clearTimeout(timeout); store.close(); officeStore?.close(); process.exit(0);
};
process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());
