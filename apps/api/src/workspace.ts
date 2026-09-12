import type { StreamUpdate, TaskView } from '@incidentos/contracts';
import type { Incidents } from './domain.js';

const BASE = 'https://app.ambiguous.ai';
type Fetch = typeof fetch;
type Mirror = { remoteId: string; status: string };

/** Incident task states mapped onto Ambiguous Workspace's task board columns. */
export function workspaceStatus(status: TaskView['status']): 'todo' | 'in_progress' | 'done' | 'cancelled' | 'blocked' {
  if (status === 'completed') return 'done';
  if (status === 'cancelled') return 'cancelled';
  if (['blocked', 'needs_review', 'failed'].includes(status)) return 'blocked';
  if (['acknowledged', 'in_progress'].includes(status)) return 'in_progress';
  return 'todo';
}

/**
 * Follow-through outside Slack: every human-owned incident task becomes a task on the team's
 * Ambiguous Workspace board and keeps its status in sync, and every saved handoff report is
 * published as an Ambiguous doc. Slack stays the system of record; this mirror is one-way, so a
 * workspace edit can never confirm a physical action. Failures are logged, never retried in a loop.
 */
export class AmbiguousWorkspace {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = new Set<string>();
  private listener = (event: StreamUpdate) => this.schedule(event.snapshot.incidentId);
  constructor(private domain: Incidents, private apiKey: string, private fetchImpl: Fetch = fetch, private delayMs = 1500) {}
  start() { this.domain.bus.on('update', this.listener); }
  stop() { this.domain.bus.off('update', this.listener); for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); }
  schedule(id: string) {
    if (this.timers.has(id)) return;
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.sync(id).catch(() => console.error('Ambiguous Workspace sync failed')); }, this.delayMs));
  }
  private async call<T>(method: string, path: string, body: unknown): Promise<T> {
    const r = await this.fetchImpl(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Ambiguous ${method} ${path} failed (${r.status})`);
    return r.json() as Promise<T>;
  }
  async sync(id: string) {
    if (this.running.has(id)) { this.schedule(id); return; }
    this.running.add(id);
    const { store } = this.domain;
    try {
      const incident = this.domain.get(id); const s = incident.snapshot;
      for (const task of s.tasks) {
        const key = `ambiguous-task-${id}-${task.id}`; const prior = store.get<Mirror>(key); const status = workspaceStatus(task.status);
        if (prior?.status === status) continue;
        try {
          if (!prior) {
            const description = [`**Incident:** ${s.title}`, `**Location:** ${s.location}`, `**Owner:** ${task.owner?.name ?? 'unassigned'}`, `**Created by agent:** ${task.agentId}`,
              '', 'Mirrored from SafeSlackForce. Confirm physical actions in the Slack thread; changes here do not confirm them.', s.slackThreadUrl ? `\n[Open the incident Slack thread](${s.slackThreadUrl})` : ''].join('\n');
            const created = await this.call<{ task: { id: string } }>('POST', '/api/tasks', { title: `[${id}] ${task.title}`.slice(0, 255), description, status, priority: 'urgent' });
            store.transaction(() => store.put(key, 'ambiguous-task', { remoteId: created.task.id, status }));
            this.domain.mutate(id, `Records mirrored task to Ambiguous Workspace: ${task.title}`, () => [{ id: created.task.id, kind: 'tool_result', label: 'Ambiguous Workspace task created' }]);
          } else {
            await this.call('PATCH', `/api/tasks/${encodeURIComponent(prior.remoteId)}`, { status });
            store.transaction(() => store.put(key, 'ambiguous-task', { ...prior, status }));
            this.domain.mutate(id, `Ambiguous Workspace task moved to ${status}: ${task.title}`, () => [{ id: prior.remoteId, kind: 'tool_result', label: 'Ambiguous Workspace task updated' }]);
          }
        } catch { console.error(`Ambiguous Workspace task mirror failed for ${id}/${task.id}`); }
      }
      for (const report of s.reports) {
        const key = `ambiguous-doc-${report.id}`; if (store.get(key)) continue;
        const saved = store.get<{ incidentId: string; markdown: string }>(report.id); if (!saved || saved.incidentId !== id) continue;
        try {
          const doc = await this.call<Record<string, any>>('POST', '/api/documents', { type: 'doc', title: `${s.title.slice(0, 80)} · handoff v${report.version}`, content: saved.markdown });
          const remoteId = String(doc.document?.id ?? doc.id ?? 'created');
          store.transaction(() => store.put(key, 'ambiguous-doc', { remoteId }));
          this.domain.mutate(id, `Records published handoff report v${report.version} to Ambiguous Workspace docs`, () => [{ id: remoteId, kind: 'tool_result', label: 'Ambiguous Workspace doc published' }]);
        } catch { console.error(`Ambiguous Workspace report publish failed for ${id}`); }
      }
    } finally { this.running.delete(id); }
  }
}
