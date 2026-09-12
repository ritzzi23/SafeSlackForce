import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { agentIds, snapshotSchema, type AgentId, type AgentStatus, type IncidentSnapshot, type SourceRef, type StreamUpdate, type TaskView } from '@incidentos/contracts';
import type { Config } from './config.js';
import { Store } from './store.js';
import { handoffBlockers, closureBlockers } from './readiness.js';
import type { OfficeDirectory } from './office.js';

export class DomainError extends Error { constructor(public status: number, message: string) { super(message); } }
export const requireThat = (condition: unknown, status: number, message: string): asserts condition => { if (!condition) throw new DomainError(status, message); };
export type Message = { id: string; text: string; author: string; timestamp: string; deleted?: boolean; source: SourceRef; revision?: string; origin?: 'slack' | 'confirmed_transcript' };
export type Attachment = { id: string; messageId: string; name: string; mimetype: string; size: number; source: SourceRef; removed?: boolean; observation?: string };
export type Notification = { id: string; taskId: string; recipient: string; text: string; state: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain'; messageId?: string; error?: string; dueAt: number; followup: boolean; acknowledgedBy?: string; attempts?: number };
export type Fact = { id: string; text: string; sourceIds: string[]; state: 'reported' | 'disputed' | 'confirmed' };
export type Incident = {
  snapshot: IncidentSnapshot; team: string; channel: string; rootTs: string;
  messages: Message[]; facts: Fact[]; notifications: Notification[];
  criticalTaskIds: string[]; acceptedBy?: string; attachments?: Attachment[]; locationSourceIds?: string[]; demoArchived?: boolean;
};
export const procedure = {
  id: 'warehouse-coordination-v1', version: 1, label: 'Synthetic warehouse coordination procedure',
  scope: 'Fictional forklift incident at a loading dock; coordination only',
  tasks: [
    { key: 'lead', title: 'Designated lead accepts incident coordination', critical: true },
    { key: 'area', title: 'Obtain designated lead confirmation of the affected area status', critical: true },
    { key: 'help', title: 'Record explicit external emergency-service contact status', critical: true },
  ],
};
export class Incidents {
  bus = new EventEmitter();
  connection: IncidentSnapshot['slackConnection'] = 'disconnected';
  constructor(public store: Store, public config: Config, public office?: OfficeDirectory) {
    if (store.list<Incident>('incident').some(i => i.snapshot.mode !== config.mode)) {
      throw new Error('Database contains incidents from another mode. Use a separate DATABASE_PATH; fixture records must never be sent to live Slack.');
    }
    this.bus.setMaxListeners(100);
  }
  all() { return this.store.list<Incident>('incident').filter(i => !i.demoArchived); }
  get(id: string) { const i = this.store.get<Incident>(id); if (!i || !i.snapshot) throw new DomainError(404, 'Incident not found'); return i; }
  find(team: string, channel: string, ts: string) { return this.all().find(i => i.team === team && i.channel === channel && i.rootTs === ts); }
  source(incident: Incident, ids: string[]): SourceRef[] {
    const refs = new Map<string, SourceRef>(incident.messages.filter(m => !m.deleted).map(m => [m.source.id, m.source]));
    refs.set(procedure.id, { id: procedure.id, kind: 'procedure', label: procedure.label });
    for (const a of incident.snapshot.activity) for (const s of a.sources) if (s.kind === 'human_confirmation' || s.kind === 'tool_result') refs.set(s.id, s);
    for (const file of incident.attachments ?? []) if (!file.removed) refs.set(file.source.id, file.source);
    for (const file of incident.attachments ?? []) if (file.removed) refs.delete(file.source.id);
    return ids.map(id => { const source = refs.get(id) ?? this.office?.source(id); if (!source) throw new DomainError(400, `Unknown or removed source: ${id}`); return source; });
  }
  create(input: { team: string; channel: string; ts: string; user: string; text: string }) {
    const existing = this.find(input.team, input.channel, input.ts); if (existing) return existing;
    const id = `INC-${randomUUID().slice(0, 8).toUpperCase()}`;
    const url = this.slackUrl(input.team, input.channel, input.ts);
    const message: Message = { id: input.ts, text: input.text, author: input.user, timestamp: new Date().toISOString(), source: { id: input.ts, label: `${input.user}: initial report`, kind: 'slack_message', url } };
    const incident: Incident = {
      team: input.team, channel: input.channel, rootTs: input.ts, messages: [message], facts: [], notifications: [], criticalTaskIds: [],
      snapshot: { schemaVersion: 1, incidentId: id, version: 0, cursor: 0, mode: this.config.mode,
        title: input.text.slice(0, 100), location: 'Not yet confirmed', status: 'reported', slackThreadUrl: url,
        slackConnection: this.connection, agents: agentIds.map(agent => ({ id: agent, name: agent[0].toUpperCase() + agent.slice(1), status: 'idle', currentTaskId: null, summary: 'No work assigned', waitingOn: null, sources: [] })),
        tasks: [], activity: [], reports: [],
      },
    };
    this.commit(incident, 'Incident reported', [message.source]); return this.get(id);
  }
  slackUrl(team: string, channel: string, ts: string) { return this.config.mode === 'fixture' ? '' : `https://app.slack.com/archives/${encodeURIComponent(channel)}/p${ts.replace('.', '')}`; }
  commit(i: Incident, text: string, sources: SourceRef[] = [], handoff?: StreamUpdate['handoff']) {
    let event!: StreamUpdate;
    this.store.transaction(() => {
      i.snapshot.version++; i.snapshot.slackConnection = this.connection;
      i.snapshot.activity.push({ id: randomUUID(), text, sources, timestamp: new Date().toISOString() });
      event = this.store.append(i.snapshot.incidentId, seq => {
        i.snapshot.cursor = seq; snapshotSchema.parse(i.snapshot);
        return { eventId: `${i.snapshot.incidentId}:${seq}`, cursor: seq, kind: 'snapshot.updated', snapshot: structuredClone(i.snapshot), ...(handoff ? { handoff } : {}) };
      });
      this.store.put(i.snapshot.incidentId, 'incident', i);
    });
    this.bus.emit('update', event);
  }
  mutate(id: string, text: string, fn: (i: Incident) => SourceRef[] | void, expected?: number) {
    const i = this.get(id); if (expected !== undefined && expected !== i.snapshot.version) throw new DomainError(409, 'Incident changed; refresh and reconsider the action');
    const refs = fn(i); this.commit(i, text, refs || []); return this.get(id);
  }
  addMessage(id: string, input: { ts: string; text: string; user: string; deleted?: boolean; revision?: string; origin?: Message['origin'] }) {
    const current = this.get(id); const old = current.messages.filter(m => m.id === input.ts).at(-1);
    // Slack events can arrive out of order. An old edit must not restore superseded evidence.
    if (old?.revision && input.revision && Number(input.revision) <= Number(old.revision)) return false;
    if (old && old.text === input.text && Boolean(old.deleted) === Boolean(input.deleted)) return false;
    this.mutate(id, old ? 'Source message corrected or removed; affected tasks require review' : 'New participant update', i => {
      const previous = i.messages.filter(m => m.id === input.ts).at(-1);
      if (previous) { previous.deleted = true; for (const task of i.snapshot.tasks) if (task.sources.some(s => s.id === previous.source.id)) { task.status = 'needs_review'; task.version++; task.blockedReason = 'Source was corrected or removed'; } }
      const sourceId = old ? `${input.ts}:${randomUUID().slice(0, 8)}` : input.ts;
      const source: SourceRef = { id: sourceId, kind: 'slack_message', label: `${input.user}: ${input.deleted ? 'removed message' : 'update'}`, url: this.slackUrl(i.team, i.channel, input.ts) };
      i.messages.push({ id: input.ts, text: input.text, author: input.user, timestamp: new Date().toISOString(), deleted: input.deleted, source, revision: input.revision ?? input.ts, origin: input.origin ?? 'slack' });
      if (old) for (const fact of i.facts) if (fact.sourceIds.includes(old.source.id)) fact.state = 'disputed';
      if (old && i.locationSourceIds?.includes(old.source.id)) { i.snapshot.location = 'Needs review: source corrected'; i.locationSourceIds = []; }
      if (input.deleted) for (const file of i.attachments ?? []) if (file.messageId === input.ts) {
        file.removed = true;
        for (const fact of i.facts) if (fact.sourceIds.includes(file.source.id)) fact.state = 'disputed';
        for (const task of i.snapshot.tasks) if (task.sources.some(s => s.id === file.source.id)) { task.status = 'needs_review'; task.version++; task.blockedReason = 'Attachment source removed'; }
      }
      if (['handoff_ready', 'handed_over', 'closed'].includes(i.snapshot.status)) { i.snapshot.status = 'coordinating'; i.acceptedBy = undefined; }
      return [source];
    }); return true;
  }
  agent(id: string, agent: AgentId, status: AgentStatus, summary: string, sources: SourceRef[] = []) {
    this.mutate(id, `${agent}: ${summary}`, i => {
      const a = i.snapshot.agents.find(a => a.id === agent)!;
      if (status === 'working' && (a.status !== 'working' || !a.currentTaskId)) a.currentTaskId = `run-${randomUUID()}`;
      a.status = status; a.summary = summary;
      a.waitingOn = status === 'waiting' || status === 'blocked' ? summary : null; a.sources = sources;
      return sources;
    });
  }
  delegate(id: string, target: AgentId, task: string) {
    const i = this.get(id); const a = i.snapshot.agents.find(a => a.id === target)!;
    a.currentTaskId = `run-${randomUUID()}`; a.status = 'working'; a.summary = task;
    this.commit(i, `Commander delegated: ${task}`, [], { from: 'commander', to: target, taskId: a.currentTaskId });
  }
  applyProcedure(id: string) {
    const i = this.get(id);
    if (i.snapshot.status === 'closed') throw new DomainError(409, 'Incident is closed');
    const report = i.messages.find(m => !m.deleted && /\bforklift\b/i.test(m.text) && /\bdock\b/i.test(m.text));
    if (!report) throw new DomainError(409, 'No matching approved procedure. Ask the site lead; do not invent one.');
    if (procedure.tasks.every(template => i.snapshot.tasks.some(t => t.id === template.key))) return i.snapshot.tasks;
    const refs = this.source(i, [procedure.id, report.source.id]);
    for (const template of procedure.tasks) {
      if (i.snapshot.tasks.some(t => t.id === template.key)) continue;
      i.snapshot.tasks.push({ id: template.key, title: template.title, agentId: 'procedure', owner: { slackUserId: this.config.lead, name: this.config.lead }, status: 'assigned', version: 1, blockedReason: null, sources: refs, slackActionUrl: i.snapshot.slackThreadUrl });
      if (template.critical) i.criticalTaskIds.push(template.key);
    }
    i.snapshot.status = 'coordinating'; this.commit(i, 'Created owned tasks from the configured procedure', refs); return i.snapshot.tasks;
  }
  confirm(id: string, taskId: string, actor: string, action: 'acknowledge' | 'complete' | 'review', version: number, note: string) {
    return this.mutate(id, `${actor} ${action}: ${taskId}`, i => {
      if (i.snapshot.status === 'closed') throw new DomainError(409, 'Incident is closed');
      const task = i.snapshot.tasks.find(t => t.id === taskId); if (!task) throw new DomainError(404, 'Task not found');
      const notified = i.notifications.some(n => n.taskId === taskId && n.recipient === actor && n.state === 'sent');
      if (task.owner?.slackUserId !== actor && !this.config.supervisors.includes(actor) && !(action === 'acknowledge' && notified)) throw new DomainError(403, 'Not authorized for this task');
      if (task.version !== version) throw new DomainError(409, 'Task changed; use the latest action');
      if (action === 'complete' && !note.trim()) throw new DomainError(400, 'An explicit confirmation note is required');
      if (action === 'acknowledge' && ['completed', 'needs_review', 'cancelled'].includes(task.status)) throw new DomainError(409, 'Task cannot be acknowledged in its current state');
      task.version++; task.status = action === 'acknowledge' ? 'acknowledged' : action === 'review' ? 'needs_review' : 'completed';
      task.blockedReason = action === 'review' ? note || 'Human review requested' : null;
      if (action === 'acknowledge') task.owner = { slackUserId: actor, name: actor };
      const source: SourceRef = { id: randomUUID(), label: `${actor}: ${note || action}`, kind: 'human_confirmation' };
      task.sources.push(source);
      if (i.snapshot.status === 'handoff_ready') i.snapshot.status = 'coordinating';
      for (const n of i.notifications) if (n.taskId === taskId && action !== 'review') n.acknowledgedBy = actor;
      return [source];
    });
  }
  handoff(id: string, actor: string, expected: number) {
    if (!this.config.supervisors.includes(actor)) throw new DomainError(403, 'Supervisor required');
    return this.mutate(id, `Handoff accepted by ${actor}`, i => {
      const blocker = handoffBlockers(i, this.reportCurrent(i))[0];
      if (blocker) throw new DomainError(409, blocker.message);
      i.snapshot.status = 'handed_over'; i.acceptedBy = actor;
      return [{ id: randomUUID(), kind: 'human_confirmation', label: `${actor} accepted handoff` }];
    }, expected);
  }
  acceptAssigned(id: string, actor: string, expected: number) {
    return this.mutate(id, `${actor} accepted their assigned tasks together`, i => {
      if (['closed', 'handed_over'].includes(i.snapshot.status)) throw new DomainError(409, 'Incident is closed or handed over');
      const tasks = i.snapshot.tasks.filter(t => t.owner?.slackUserId === actor && ['proposed', 'assigned'].includes(t.status));
      if (!tasks.length) throw new DomainError(403, 'No unacknowledged tasks assigned to you');
      const source: SourceRef = { id: randomUUID(), kind: 'human_confirmation', label: `${actor} accepted ownership; physical completion is not confirmed` };
      for (const t of tasks) {
        t.status = 'acknowledged'; t.version++; t.sources.push(source);
        for (const n of i.notifications.filter(n => n.taskId === t.id)) n.acknowledgedBy = actor;
      }
      if (i.snapshot.status === 'handoff_ready') i.snapshot.status = 'coordinating';
      return [source];
    }, expected);
  }
  automaticReportKey(id: string): string | undefined {
    const i = this.get(id);
    if (i.demoArchived || ['closed', 'handed_over'].includes(i.snapshot.status) || !i.snapshot.tasks.length || this.reportCurrent(i)) return;
    if (i.snapshot.tasks.some(t => !t.owner && !['completed', 'cancelled'].includes(t.status))) return;
    return this.fingerprint(i);
  }
  close(id: string, actor: string, expected: number, note = '') {
    if (!this.config.supervisors.includes(actor)) throw new DomainError(403, 'Supervisor required');
    if (!note.trim()) throw new DomainError(400, 'Closure confirmation note is required');
    return this.mutate(id, `Incident closed by ${actor}`, i => {
      const blocker = closureBlockers(i)[0];
      if (blocker) throw new DomainError(409, blocker.message);
      i.snapshot.status = 'closed';
      return [{ id: randomUUID(), kind: 'human_confirmation', label: `${actor} closure confirmation: ${note}` }];
    }, expected);
  }
  report(id: string, summary: string, sourceIds: string[]) {
    const i = this.get(id); const refs = this.source(i, sourceIds); const reportId = `report-${randomUUID()}`;
    if (i.snapshot.status === 'closed') throw new DomainError(409, 'Incident is closed');
    const clean = (s: string) => s.replace(/[\r\n]/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const markdown = [`# ${i.snapshot.incidentId}: Handoff report`, '', `Mode: ${i.snapshot.mode}. Status: ${i.snapshot.status}.`, '', '## Summary', '', clean(summary), '', '## Tasks and owners', '',
      ...i.snapshot.tasks.map(t => `- [${t.status}] ${clean(t.title)} — owner: ${clean(t.owner?.name ?? 'UNASSIGNED')}${t.blockedReason ? `; blocker: ${clean(t.blockedReason)}` : ''}`), '', '## Reported facts', '',
      ...i.facts.map(f => `- [${f.state}] ${clean(f.text)} (sources: ${f.sourceIds.join(', ')})`), '', '## Source messages, including corrections', '',
      ...i.messages.map(m => `- ${m.source.id} [${m.deleted ? 'superseded or removed' : 'current'}] ${clean(m.author)}: ${clean(m.text)}`), '', '## Attachments', '',
      ...(i.attachments ?? []).map(a => `- ${a.source.id}: ${clean(a.name)} [${a.removed ? 'removed' : 'available'}]. ${clean(a.observation ?? 'Not analyzed; no conclusions inferred.')}`), '', '## Notification receipts', '',
      ...i.notifications.map(n => `- ${n.id}: ${n.state}, recipient ${n.recipient}, acknowledgement ${n.acknowledgedBy ?? 'not received'}, receipt ${n.messageId ?? 'none'}`), '', '## Timeline', '',
      ...i.snapshot.activity.map(a => `- ${a.timestamp}: ${clean(a.text)}${a.sources.length ? ` [${a.sources.map(s => s.id).join(', ')}]` : ''}`), '', '## Summary source references', '',
      ...refs.map(r => `- ${r.id}: ${clean(r.label)}${r.url ? ` (${r.url})` : ''}`), '', 'This report records coordination and reported confirmations; it does not certify site safety.', ''].join('\n');
    this.store.transaction(() => this.store.put(reportId, 'report', { incidentId: id, markdown, fingerprint: this.fingerprint(i) }));
    i.snapshot.reports.push({ id: reportId, version: i.snapshot.reports.length + 1, title: `Handoff report ${i.snapshot.reports.length + 1}`, downloadUrl: `/api/incidents/${id}/reports/${reportId}` });
    i.snapshot.status = 'handoff_ready';
    this.commit(i, 'Saved sourced handoff report', refs); return { reportId, markdown };
  }
  setConnection(state: IncidentSnapshot['slackConnection']) {
    if (this.connection === state) return;
    this.connection = state; for (const i of this.all()) this.commit(i, `Slack ${state}`);
  }
  private reportCurrent(i: Incident) {
    const report = i.snapshot.reports.at(-1);
    const saved = report ? this.store.get<{ fingerprint: string }>(report.id) : undefined;
    return Boolean(saved && saved.fingerprint === this.fingerprint(i));
  }
  readiness(id: string) {
    const i = this.get(id);
    const finished = i.snapshot.status === 'closed';
    return {
      incidentId: id, version: i.snapshot.version,
      handoff: { state: finished || i.snapshot.status === 'handed_over' ? 'done' : 'pending', blockers: finished || i.snapshot.status === 'handed_over' ? [] : handoffBlockers(i, this.reportCurrent(i)), requirement: 'A designated supervisor must accept. Open work may transfer if every open task has an owner.' },
      closure: { state: finished ? 'done' : 'pending', blockers: finished ? [] : closureBlockers(i), requirement: 'A designated supervisor must confirm closure with a note. Every critical task must be completed.' },
      tasks: i.snapshot.tasks.map(t => ({
        taskId: t.id, title: t.title, status: t.status, owner: t.owner?.name ?? null,
        explanation: t.status === 'completed' ? 'Recorded complete; inspect the attributed confirmation below. This is not independent verification of physical work.'
          : t.status === 'cancelled' ? 'Cancelled, not completed. A critical cancelled task still blocks closure.'
          : t.status === 'needs_review' ? t.blockedReason || 'Evidence changed or a person requested review. Reconcile before confirming completion.'
          : t.status === 'acknowledged' || t.status === 'in_progress' ? 'Ownership accepted; completion has not been confirmed.'
          : t.blockedReason || 'Completion has not been confirmed. Delivery receipts alone do not establish acknowledgement or completion.',
        sources: t.sources,
        notifications: i.notifications.filter(n => n.taskId === t.id).map(n => ({ id: n.id, recipient: n.recipient, state: n.state, acknowledgedBy: n.acknowledgedBy ?? null, receipt: n.messageId ?? null })),
      })),
    };
  }
  private fingerprint(i: Incident) {
    return createHash('sha256').update(JSON.stringify({ messages: i.messages, tasks: i.snapshot.tasks, facts: i.facts, notifications: i.notifications, attachments: i.attachments, location: i.snapshot.location })).digest('hex');
  }
}
