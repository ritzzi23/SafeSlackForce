import { randomUUID } from 'node:crypto';
import type { Incident, Notification } from './domain.js';
import { DomainError, Incidents } from './domain.js';

export type Action = { action_id: string; text: string; value: string };
export interface Channel {
  send(incident: Incident, text: string, actions?: Action[]): Promise<string>;
}
export class FixtureChannel implements Channel {
  sent: { incidentId: string; text: string; actions: Action[]; messageId: string }[] = [];
  async send(i: Incident, text: string, actions: Action[] = []) {
    const messageId = `fixture-${randomUUID()}`;
    this.sent.push({ incidentId: i.snapshot.incidentId, text, actions, messageId }); return messageId;
  }
}
export class Notifications {
  private pumping = false;
  constructor(public domain: Incidents, public channel: Channel) {}
  enqueue(id: string, taskId: string, recipient: string, text: string, followup = false) {
    const i = this.domain.get(id);
    if (![this.domain.config.lead, this.domain.config.backup, ...this.domain.config.supervisors].includes(recipient)) throw new DomainError(403, 'Recipient is outside the configured roster');
    const task = i.snapshot.tasks.find(t => t.id === taskId); if (!task) throw new DomainError(404, 'Task not found');
    if (['completed', 'cancelled'].includes(task.status)) throw new DomainError(409, 'Task is no longer open');
    const existing = i.notifications.find(n => n.taskId === taskId && n.recipient === recipient && n.followup === followup);
    if (existing) return existing;
    const n: Notification = { id: randomUUID(), taskId, recipient, text, state: 'pending', dueAt: Date.now() + this.domain.config.followupMs, followup };
    i.notifications.push(n); this.domain.commit(i, `${followup ? 'Follow-up' : 'Notification'} queued for ${recipient}`); return n;
  }
  async pump() {
    if (this.pumping) return; this.pumping = true;
    try {
      for (const incident of this.domain.all()) {
        if (incident.snapshot.status === 'closed') continue;
        const id = incident.snapshot.incidentId;
        for (const n of incident.notifications) {
          if (n.state === 'sent' && !n.followup && !n.acknowledgedBy && n.dueAt <= Date.now()) {
            const current = this.domain.get(id); const task = current.snapshot.tasks.find(t => t.id === n.taskId)!;
            if (['assigned', 'proposed'].includes(task.status)) this.enqueue(id, n.taskId, this.domain.config.backup, `No acknowledgement received for: ${task.title}. Please accept responsibility or request review.`, true);
          }
        }
        for (const pending of this.domain.get(id).notifications.filter(n => n.state === 'pending' && !n.acknowledgedBy)) {
          const latest = this.domain.get(id); const currentTask = latest.snapshot.tasks.find(t => t.id === pending.taskId);
          if (!currentTask || ['completed', 'cancelled'].includes(currentTask.status)) {
            this.domain.mutate(id, 'Skipped notification for a task that is no longer open', i => { const n = i.notifications.find(n => n.id === pending.id)!; n.state = 'failed'; n.error = 'Task is no longer open'; }); continue;
          }
          this.domain.mutate(id, 'Notification dispatch started', i => { const n = i.notifications.find(n => n.id === pending.id)!; n.state = 'sending'; n.attempts = (n.attempts ?? 0) + 1; });
          try {
            const current = this.domain.get(id); const task = current.snapshot.tasks.find(t => t.id === pending.taskId)!;
            const value = JSON.stringify({ incidentId: id, taskId: task.id, version: task.version });
            const safeText = pending.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const messageId = await this.channel.send(current, `<@${pending.recipient}> ${safeText}`, [
              { action_id: 'incident_acknowledge', text: 'Acknowledge task', value },
              { action_id: 'incident_review', text: 'Request review', value },
              { action_id: 'incident_complete', text: 'Confirm action…', value },
            ]);
            this.domain.mutate(id, `Notification delivered to ${pending.recipient}; acknowledgement pending`, i => {
              const n = i.notifications.find(n => n.id === pending.id)!; n.state = 'sent'; n.messageId = messageId; n.dueAt = Date.now() + this.domain.config.followupMs;
              return [{ id: messageId, kind: 'tool_result', label: `Delivery receipt for ${pending.recipient}` }];
            });
          } catch {
            // A timeout may happen after Slack accepted the send; do not automatically duplicate it.
            this.domain.mutate(id, 'Notification delivery uncertain; manual review required', i => {
              const n = i.notifications.find(n => n.id === pending.id)!; n.state = 'uncertain'; n.error = 'Channel request failed; inspect Slack before retrying';
            });
            this.domain.agent(id, 'communications', 'failed', 'Delivery uncertain. A supervisor must inspect Slack before retrying.');
          }
        }
      }
    } finally { this.pumping = false; }
  }
  retry(id: string, notificationId: string, actor: string, checkedSlack: boolean) {
    if (!this.domain.config.supervisors.includes(actor)) throw new DomainError(403, 'Supervisor required');
    if (!checkedSlack) throw new DomainError(400, 'Inspect Slack for a delivered copy before retrying');
    return this.domain.mutate(id, `${actor} inspected Slack and requested a delivery retry`, i => {
      const n = i.notifications.find(n => n.id === notificationId);
      if (!n) throw new DomainError(404, 'Notification not found');
      const task = i.snapshot.tasks.find(t => t.id === n.taskId);
      if (!task || ['completed', 'cancelled'].includes(task.status) || n.acknowledgedBy || i.snapshot.status === 'closed') throw new DomainError(409, 'Notification is no longer needed');
      if (!['uncertain', 'failed'].includes(n.state)) throw new DomainError(409, 'Only a failed or uncertain send can be retried');
      if ((n.attempts ?? 0) >= 3) throw new DomainError(409, 'Three delivery attempts reached; handle manually');
      n.state = 'pending'; n.error = undefined;
      return [{ id: randomUUID(), kind: 'human_confirmation', label: `${actor} checked for duplicates before retry` }];
    });
  }
  recover() {
    for (const i of this.domain.all()) if (i.notifications.some(n => n.state === 'sending')) this.domain.mutate(i.snapshot.incidentId, 'Interrupted sends require delivery review', current => {
      for (const n of current.notifications) if (n.state === 'sending') n.state = 'uncertain';
    });
  }
}
