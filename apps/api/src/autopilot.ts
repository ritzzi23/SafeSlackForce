import type { StreamUpdate } from '@incidentos/contracts';
import { Incidents } from './domain.js';
import { Agents } from './agents.js';

/** Digital follow-through only: no inferred human acknowledgements or physical actions. */
export class Autopilot {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private active = new Set<string>();
  private observed = new Map<string, string | undefined>();
  private stopped = true;
  private listener = (event: StreamUpdate) => {
    const id = event.snapshot.incidentId;
    const key = this.domain.automaticReportKey(id);
    if (this.observed.get(id) === key) return;
    this.observed.set(id, key);
    if (key) this.schedule(id);
  };
  constructor(private domain: Incidents, private agents: Agents, private limit = 4, private delayMs = 1500) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    for (const i of this.domain.all()) this.observed.set(i.snapshot.incidentId, this.domain.automaticReportKey(i.snapshot.incidentId));
    this.domain.bus.on('update', this.listener);
  }
  stop() { this.stopped = true; this.domain.bus.off('update', this.listener); for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); }
  schedule(id: string) {
    if (this.stopped || this.timers.has(id)) return;
    this.timers.set(id, setTimeout(() => { this.timers.delete(id); void this.tick(id).catch(() => {}); }, this.delayMs));
  }
  async tick(id: string) {
    if (this.stopped || this.active.has(id)) return;
    if (this.agents.busy) { this.schedule(id); return; }
    const fingerprint = this.domain.automaticReportKey(id); if (!fingerprint) return;
    const key = `autopilot-report-${id}`;
    const state = this.domain.store.get<{ attempts: number; fingerprint: string; status: string }>(key);
    // Persist attempts before inference: retries/restarts cannot create runaway spend.
    if (state?.fingerprint === fingerprint) return;
    if ((state?.attempts ?? 0) >= this.limit) {
      if (state?.status !== 'capped') {
        this.domain.store.transaction(() => this.domain.store.put(key, 'autopilot', { ...state, status: 'capped' }));
        this.domain.agent(id, 'records', 'waiting', 'Automatic report allowance reached. Use Prepare handoff report if another revision is needed.');
      }
      return;
    }
    this.active.add(id);
    const attempt = { attempts: (state?.attempts ?? 0) + 1, fingerprint, status: 'running' };
    this.domain.store.transaction(() => this.domain.store.put(key, 'autopilot', attempt));
    try {
      await this.agents.enqueue(id, async () => {
        if (this.stopped || this.domain.automaticReportKey(id) !== fingerprint) return;
        const before = this.domain.get(id).snapshot.reports.length;
        this.domain.delegate(id, 'records', 'Automatically prepare or refresh the sourced handoff after an operational update.');
        await this.agents.prepareReport(id, 'Read the current incident and every history page, then save a sourced handoff report without asking permission to draft it. Include unresolved tasks, unknown facts and delivery failures. Never mark human actions complete or accept/close the incident.');
        if (this.domain.get(id).snapshot.reports.length <= before) throw new Error('Records did not save a report');
      });
      attempt.status = 'done';
    } catch {
      attempt.status = 'failed';
      this.domain.agent(id, 'records', 'failed', 'Automatic report preparation failed; no completion assumed. Retry explicitly after checking the cause.');
    } finally {
      this.domain.store.transaction(() => this.domain.store.put(key, 'autopilot', attempt));
      this.active.delete(id);
      if (this.domain.automaticReportKey(id) && this.domain.automaticReportKey(id) !== fingerprint) this.schedule(id);
    }
  }
}
