import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ResponseAction, SourceRef } from '@safeslackforce/contracts';
import { DomainError, Incidents } from './domain.js';
import type { Channel } from './notifications.js';

export const responseRequest = z.object({
  action: z.enum(['management', 'followup', 'emergency_call']),
  reason: z.string().trim().min(1).max(1000),
  delaySeconds: z.number().int().min(30).max(3600).optional(),
}).strict();

/** Persist intent before dispatch. No human approval gates and no blind retry after an uncertain send. */
export class ResponseOperations {
  private active = new Set<string>();
  constructor(private domain: Incidents, private channel: Channel) {}
  private update(id: string, key: string, patch: Partial<ResponseAction>) {
    return this.domain.mutate(id, `Autonomous action: ${patch.summary ?? key}`, i => {
      const a = i.snapshot.responseActions!.find(a => a.id === key)!;
      Object.assign(a, patch, { updatedAt: new Date().toISOString() }); return a.sources;
    }).snapshot.responseActions!.find(a => a.id === key)!;
  }
  async ensure(id: string) {
    if (!this.domain.config.autonomousResponse) return;
    // Explicit coordination actions are allowed independently of procedure/ownership acknowledgement.
    await this.run(id, { action: 'management', reason: 'Incident reported; notify configured management immediately.' });
    await this.run(id, { action: 'followup', reason: 'Track outstanding work and schedule the next status update.' });
    if (this.domain.get(id).messages.some(m => !m.deleted && /\b(injur\w*|emergency|fire|unconscious)\b/i.test(m.text))) {
      await this.run(id, { action: 'emergency_call', reason: 'Reported incident requires emergency-contact routing.' });
    }
  }
  async run(id: string, input: unknown): Promise<ResponseAction> {
    if (!this.domain.config.autonomousResponse) throw new DomainError(409, 'Autonomous response is disabled');
    const args = responseRequest.parse(input), i = this.domain.get(id);
    if (i.demoArchived || ['closed', 'handed_over'].includes(i.snapshot.status)) throw new DomainError(409, 'Incident is no longer actively coordinated');
    const existing = i.snapshot.responseActions?.find(a => a.id === args.action);
    if (existing) {
      if (args.action === 'followup' && ['scheduled', 'completed', 'cancelled'].includes(existing.status) && args.delaySeconds !== undefined) return this.update(id, existing.id, { status: 'scheduled', receipt: null, dueAt: new Date(Date.now() + args.delaySeconds * 1000).toISOString(), summary: `Next incident update rescheduled: ${args.reason}` });
      return existing;
    }
    const sources: SourceRef[] = i.messages.filter(m => !m.deleted).slice(-1).map(m => m.source);
    if (this.domain.office) {
      const category = args.action === 'management' ? 'management' : 'protocols';
      sources.push(...this.domain.office.search({ category, query: '' }).records.map(r => r.source));
    }
    const a: ResponseAction = {
      id: args.action, kind: args.action, title: args.action === 'management' ? 'Inform management' : args.action === 'followup' ? 'Schedule incident follow-up' : 'Emergency call dispatch',
      status: args.action === 'followup' ? 'scheduled' : 'running', summary: args.reason,
      dueAt: args.action === 'followup' ? new Date(Date.now() + (args.delaySeconds ? args.delaySeconds * 1000 : this.domain.config.followupMs)).toISOString() : null,
      receipt: null, updatedAt: new Date().toISOString(), sources,
    };
    this.domain.mutate(id, `Autonomous action started: ${a.title}`, current => { (current.snapshot.responseActions ??= []).push(a); return sources; });
    if (args.action === 'followup') return a;
    if (args.action === 'emergency_call') {
      const synthetic = i.messages.some(m => !m.deleted && /\bsynthetic\b/i.test(m.text));
      return this.domain.config.emergencyCallMode === 'simulation' && synthetic
        ? this.update(id, a.id, { status: 'simulated', receipt: `simulation-${randomUUID()}`, summary: 'SIMULATED emergency-call dispatch recorded. No telephone call was placed and no emergency service was contacted.' })
        : this.update(id, a.id, { status: 'blocked', summary: 'No verified emergency telephone provider/routing is connected. No call placed. Other coordination continues automatically.' });
    }
    return this.dispatch(id, a.id, `SafeSlackForce incident alert: ${id}. ${i.snapshot.location}. Management coordination is active. Review the shared incident thread and add observations. ${i.snapshot.slackThreadUrl}`);
  }
  private async dispatch(id: string, key: string, message: string) {
    const recipients = [...new Set(this.domain.config.supervisors)];
    if (!recipients.length) return this.update(id, key, { status: 'blocked', summary: 'No management recipient is configured.' });
    try {
      const safe = message.replace(/[<>&]/g, ' ');
      const receipt = await this.channel.send(this.domain.get(id), `${recipients.map(r => `<@${r}>`).join(' ')} ${safe}`);
      const result = this.update(id, key, { status: 'completed', receipt, summary: key === 'management' ? 'Management notified in the shared incident thread. Delivery receipt recorded; coordination continues automatically.' : 'Scheduled incident update delivered to management.' });
      this.domain.mutate(id, 'Autonomous delivery receipt recorded', () => [{ id: receipt, kind: 'tool_result', label: result.title }]);
      return result;
    } catch {
      return this.update(id, key, { status: 'uncertain', summary: 'Slack delivery outcome is uncertain. Other actions continue; this send will not be duplicated automatically.' });
    }
  }
  async pump(now = Date.now()) {
    for (const i of this.domain.all()) {
      const id = i.snapshot.incidentId;
      if (this.active.has(id)) continue;
      const action = i.snapshot.responseActions?.find(a => a.kind === 'followup' && a.status === 'scheduled' && Date.parse(a.dueAt!) <= now);
      if (!action) continue;
      this.active.add(id);
      try {
        const open = i.snapshot.tasks.filter(t => !['completed', 'cancelled'].includes(t.status));
        if (['closed', 'handed_over'].includes(i.snapshot.status) || !open.length) { this.update(id, action.id, { status: 'cancelled', summary: 'Scheduled update cancelled because no active work remains.' }); continue; }
        this.update(id, action.id, { status: 'running', summary: 'Dispatching the scheduled incident status update.' });
        await this.dispatch(id, action.id, `Scheduled status update for ${id}: ${open.map(t => `${t.title} (${t.status})`).join('; ')}. Add any new details in this incident thread. ${i.snapshot.slackThreadUrl}`);
      } finally { this.active.delete(id); }
    }
  }
  recover() {
    for (const i of this.domain.all()) for (const a of i.snapshot.responseActions ?? []) if (a.status === 'running') this.update(i.snapshot.incidentId, a.id, { status: 'uncertain', summary: 'Action interrupted by restart. Inspect the recorded outcome before retrying; other coordination continues.' });
  }
}
