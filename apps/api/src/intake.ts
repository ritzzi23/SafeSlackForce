import { createHash } from 'node:crypto';
import { Agents } from './agents.js';
import { Incidents } from './domain.js';

/** Verified Slack envelopes enter here; no browser-supplied workspace identity is trusted. */
export class SlackIntake {
  constructor(private domain: Incidents, private agents: Agents,
    private files?: (id: string, ts: string, files: { id: string }[]) => Promise<void>) {}
  receive(event: any, team: string, eventId?: string): string | undefined {
    const config = this.domain.config;
    if (team !== config.team || event.channel !== config.channel || event.bot_id || event.subtype === 'bot_message') return;
    const message = event.subtype === 'message_changed' ? event.message
      : event.subtype === 'message_deleted' ? event.previous_message : event;
    if (!message || message.bot_id || !message.ts || !message.user) return;
    const allowed = [undefined, 'file_share', 'message_changed', 'message_deleted'];
    if (!allowed.includes(event.subtype)) return;
    const eventKey = eventId ? `slack-event-${team}-${eventId}` : undefined;
    if (eventKey && this.domain.store.get(eventKey)) return;
    const root = message.thread_ts || message.ts;
    let incident = this.domain.find(team, event.channel, root);
    if (!incident && (event.type !== 'app_mention' || event.subtype)) return;
    let changed = false;
    if (!incident) {
      incident = this.domain.create({ team, channel: event.channel, ts: root, user: message.user, text: message.text || 'Attachment report' });
      changed = true;
    } else {
      changed = this.domain.addMessage(incident.snapshot.incidentId, {
        ts: message.ts, text: message.text || '', user: message.user,
        revision: message.edited?.ts || event.event_ts || message.ts,
        deleted: event.subtype === 'message_deleted',
      });
    }
    const id = incident.snapshot.incidentId;
    const files = (message.files ?? []).filter((f: any) => typeof f.id === 'string').map((f: any) => ({ id: f.id }));
    const filesKey = `slack-files-${createHash('sha256').update(JSON.stringify([id, message.ts, files])).digest('hex')}`;
    const newFiles = files.length && !this.domain.store.get(filesKey) && event.subtype !== 'message_deleted';
    if (eventKey) this.domain.store.transaction(() => this.domain.store.put(eventKey, 'slack-event', { id, receivedAt: Date.now() }));
    if (!changed && !newFiles) return;
    const jobId = `slack-job-${team}-${eventId || createHash('sha256').update(JSON.stringify(event)).digest('hex')}`;
    const job = { id: jobId, incidentId: id, state: 'pending' };
    this.domain.store.transaction(() => this.domain.store.put(jobId, 'slack-job', job));
    void this.agents.enqueue(id, async () => {
      job.state = 'running'; this.domain.store.transaction(() => this.domain.store.put(jobId, 'slack-job', job));
      if (newFiles && this.files) {
        try { await this.files(id, message.ts, files); this.domain.store.transaction(() => this.domain.store.put(filesKey, 'slack-files', { id })); }
        catch { this.domain.agent(id, 'evidence', 'failed', 'Attachment ingestion failed; text evidence remains available'); }
      }
      await this.agents.run(id, 'commander', 'Read the updated incident, coordinate outstanding tasks and inspect relevant evidence. Do not repeat completed work.');
      job.state = 'done'; this.domain.store.transaction(() => this.domain.store.put(jobId, 'slack-job', job));
    }).catch(() => {
      job.state = 'failed'; this.domain.store.transaction(() => this.domain.store.put(jobId, 'slack-job', job));
    });
    return id;
  }
}
