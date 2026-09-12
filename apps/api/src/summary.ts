import type { KnownBlock } from '@slack/types';
import { DomainError, Incidents } from './domain.js';
import type { StreamUpdate } from '@incidentos/contracts';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
type SummaryRecord = { state: 'sending' | 'sent' | 'uncertain'; ts?: string; error?: string };
export interface SummaryTransport {
  post(channel: string, thread: string, text: string, blocks: KnownBlock[]): Promise<string>;
  update(channel: string, ts: string, text: string, blocks: KnownBlock[]): Promise<void>;
}
export class SummaryPublisher {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = new Map<string, Promise<void>>();
  private listener = (event: StreamUpdate) => this.schedule(event.snapshot.incidentId);
  constructor(private domain: Incidents, private transport: SummaryTransport) {}
  start() { this.domain.bus.on('update', this.listener); for (const i of this.domain.all()) this.schedule(i.snapshot.incidentId); }
  stop() { this.domain.bus.off('update', this.listener); for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); }
  schedule(id: string) {
    if (this.timers.has(id)) return;
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.publish(id).catch(() => {}); }, 750));
  }
  retry(id: string, actor: string) {
    if (!this.domain.config.supervisors.includes(actor)) throw new DomainError(403, 'Supervisor required');
    if (this.inflight.has(id)) throw new DomainError(409, 'Summary update is already running');
    const key = `summary-${id}`; const prior = this.domain.store.get<SummaryRecord>(key);
    if (prior?.ts) { this.schedule(id); return; }
    this.domain.store.transaction(() => this.domain.store.put(key, 'summary', { state: 'sent' }));
    this.domain.mutate(id, `${actor} checked Slack and explicitly requested summary recreation`, () => []);
    this.schedule(id);
  }
  async publish(id: string): Promise<void> {
    const active = this.inflight.get(id);
    if (active) { await active; this.schedule(id); return; }
    const promise = this.write(id); this.inflight.set(id, promise);
    try { await promise; } finally { this.inflight.delete(id); }
  }
  private async write(id: string) {
    const i = this.domain.get(id); if (i.demoArchived) return;
    const s = i.snapshot;
    const key = `summary-${id}`; const saved = this.domain.store.get<SummaryRecord>(key);
    if (saved && !saved.ts && ['sending', 'uncertain'].includes(saved.state)) return;
    const text = `${id}: ${s.status}. ${s.tasks.filter(t => t.status !== 'completed').length} tasks outstanding.`;
    const button = (action_id: string, label: string, value: object) => ({ type: 'button', action_id, text: { type: 'plain_text', text: label }, value: JSON.stringify(value) });
    const blocks: KnownBlock[] = [
      { type: 'header', text: { type: 'plain_text', text: `${id} | ${s.status}` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Reported location:* ${escape(s.location)}\n*Commander:* ${escape(s.agents[0].summary).slice(0, 2000)}` } },
    ];
    if (s.responseActions?.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Autonomous response — no approval needed*\n${s.responseActions.map(a => `• ${escape(a.title)}: *${a.status}*${a.dueAt ? ` · ${escape(a.dueAt)}` : ''}\n${escape(a.summary)}`).join('\n').slice(0, 2800)}` } });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: s.agents.slice(1).map(a => `*${a.name} (${a.status}):* ${escape(a.summary).slice(0, 350)}`).join('\n') } });
    if (!this.domain.config.autonomousResponse && !['closed', 'handed_over'].includes(s.status) && s.tasks.some(t => ['assigned', 'proposed'].includes(t.status))) {
      blocks.push({ type: 'actions', elements: [button('incident_accept_assigned', 'Accept my assigned tasks', { incidentId: id, version: s.version })] } as KnownBlock);
    }
    for (const t of s.tasks.slice(0, 10)) {
      const value = { incidentId: id, taskId: t.id, version: t.version };
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${escape(t.title)}*\n${t.status} | owner: ${escape(t.owner?.name ?? 'UNASSIGNED')}${t.blockedReason ? `\n${escape(t.blockedReason)}` : ''}` } });
      if (!this.domain.config.autonomousResponse && s.status !== 'closed') blocks.push({ type: 'actions', elements: [
        ...(['assigned', 'proposed'].includes(t.status) ? [button('incident_acknowledge', 'Accept ownership', value)] : []),
        button('incident_complete', 'Confirm action…', value), button('incident_review', 'Request review', value),
      ] } as KnownBlock);
    }
    for (const n of i.notifications.filter(n => ['uncertain', 'failed'].includes(n.state)).slice(0, 3)) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `Delivery to ${escape(n.recipient)}: *${n.state}*. Inspect Slack before retrying.` } });
      blocks.push({ type: 'actions', elements: [button('incident_retry_delivery', 'Retry (checked Slack)', { incidentId: id, notificationId: n.id })] } as KnownBlock);
    }
    const controls = [button('incident_report', 'Prepare handoff report', { incidentId: id }), button('incident_run', 'Retry agent coordination', { incidentId: id })];
    if (!this.domain.config.autonomousResponse && s.status === 'handoff_ready') controls.push(button('incident_handoff', 'Accept handoff', { incidentId: id, version: s.version }));
    if (!this.domain.config.autonomousResponse && s.status === 'handed_over') controls.push(button('incident_close', 'Close with confirmation…', { incidentId: id, version: s.version }));
    if (s.status !== 'closed') blocks.push({ type: 'actions', elements: controls } as KnownBlock);
    const url = new URL(this.domain.config.dashboardUrl); url.searchParams.set('incidentId', id);
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Join the shared incident response*\n<${s.slackThreadUrl}|Open thread and add details> · <${url.toString()}|Command center, reports & shareable QR>\nReply in this thread with new observations. Agents process updates automatically. Synthetic demonstration; simulated calls never contact emergency services.` } });
    const record: SummaryRecord = { state: 'sending', ts: saved?.ts };
    this.domain.store.transaction(() => this.domain.store.put(key, 'summary', record));
    try {
      if (record.ts) await this.transport.update(i.channel, record.ts, text, blocks);
      else record.ts = await this.transport.post(i.channel, i.rootTs, text, blocks);
      record.state = 'sent'; record.error = undefined;
    } catch { record.state = 'uncertain'; record.error = 'Summary delivery/update failed; inspect Slack before recreating a missing card'; }
    this.domain.store.transaction(() => this.domain.store.put(key, 'summary', record));
  }
}
