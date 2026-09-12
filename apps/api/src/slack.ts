import bolt from '@slack/bolt';
import { z } from 'zod';
import { Agents } from './agents.js';
import { DomainError, type Incident, Incidents } from './domain.js';
import type { Action, Channel } from './notifications.js';
import type { Config } from './config.js';
import type { KnownBlock } from '@slack/types';
import { SlackIntake } from './intake.js';
import { SummaryPublisher } from './summary.js';
const actionSchema = z.object({ incidentId: z.string(), taskId: z.string(), version: z.number().int() });
const escapeSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class SlackChannel implements Channel {
  app: InstanceType<typeof bolt.App>;
  receiver: InstanceType<typeof bolt.SocketModeReceiver>;
  summaries?: SummaryPublisher;
  constructor(public config: Config) {
    this.receiver = new bolt.SocketModeReceiver({ appToken: config.appToken });
    this.app = new bolt.App({ token: config.botToken, receiver: this.receiver,
      clientOptions: { retryConfig: { retries: 0 }, rejectRateLimitedCalls: true, timeout: 15000 } });
  }
  async send(i: Incident, text: string, actions: Action[] = []) {
    const result = await this.app.client.chat.postMessage({ channel: i.channel, thread_ts: i.rootTs, text,
      blocks: [ { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } },
        ...(actions.length ? [{ type: 'actions', elements: actions.map(a => ({ type: 'button', action_id: a.action_id, text: { type: 'plain_text', text: a.text }, value: a.value })) }] : []),
      ] as KnownBlock[],
    });
    if (!result.ok || !result.ts) throw new Error('Slack did not confirm message delivery'); return result.ts;
  }
  wire(domain: Incidents, agents: Agents, files?: (id: string, ts: string, files: { id: string }[]) => Promise<void>) {
    const app = this.app;
    const reportError = (error: unknown) => console.error('Slack workflow error:', error instanceof DomainError ? error.message : 'See failed agent/task status');
    const intake = new SlackIntake(domain, agents, files);
    this.summaries = new SummaryPublisher(domain, {
      post: async (channel, thread_ts, text, blocks) => { const r = await app.client.chat.postMessage({ channel, thread_ts, text, blocks }); if (!r.ok || !r.ts) throw new Error('Summary not delivered'); return r.ts; },
      update: async (channel, ts, text, blocks) => { const r = await app.client.chat.update({ channel, ts, text, blocks }); if (!r.ok) throw new Error('Summary update failed'); },
    });
    this.summaries.start();
    for (const state of ['connected', 'reconnecting', 'disconnected'] as const) this.receiver.client.on(state, () => domain.setConnection(state));
    app.event('app_mention', async ({ event, body }) => {
      try {
        if (body.team_id === this.config.team && event.channel === this.config.channel && /retry summary after checking Slack/i.test(event.text)) {
          const incident = domain.find(body.team_id, event.channel, event.thread_ts || event.ts);
          if (incident && event.user) { this.summaries!.retry(incident.snapshot.incidentId, event.user); return; }
        }
        intake.receive(event, body.team_id || '', body.event_id);
      } catch (e) { reportError(e); }
    });
    app.event('message', async ({ event, body }) => { try { intake.receive(event, body.team_id || '', body.event_id); } catch (e) { reportError(e); } });

    app.action(/incident_(acknowledge|review|complete)/, async ({ ack, body, client }) => {
      await ack(); const b = body as any;
      if (b.team?.id !== this.config.team || b.channel?.id !== this.config.channel) return;
      try {
        const a = b.actions?.[0]; const data = actionSchema.parse(JSON.parse(a.value)); const i = domain.get(data.incidentId);
        if (i.channel !== b.channel.id) throw new DomainError(403, 'Wrong incident channel');
        if (a.action_id === 'incident_complete') {
          await client.views.open({ trigger_id: b.trigger_id, view: {
            type: 'modal', callback_id: 'incident_confirm_modal', private_metadata: JSON.stringify(data),
            title: { type: 'plain_text', text: 'Confirm your action' }, submit: { type: 'plain_text', text: 'Confirm' },
            blocks: [{ type: 'input', block_id: 'confirmation', label: { type: 'plain_text', text: 'What did you personally confirm?' }, element: { type: 'plain_text_input', action_id: 'note', multiline: true, max_length: 2000 } }],
          } }); return;
        }
        domain.confirm(data.incidentId, data.taskId, b.user.id, a.action_id === 'incident_acknowledge' ? 'acknowledge' : 'review', data.version, a.action_id === 'incident_review' ? 'Review requested in Slack' : 'Accepted responsibility in Slack');
        const current = domain.get(data.incidentId); const task = current.snapshot.tasks.find(t => t.id === data.taskId)!;
        await this.send(current, `<@${b.user.id}> updated *${escapeSlack(task.title)}*: ${task.status}`, [{ action_id: 'incident_complete', text: 'Confirm action…', value: JSON.stringify({ ...data, version: task.version }) }]);
      } catch (e) { await client.chat.postEphemeral({ channel: b.channel.id, user: b.user.id, text: e instanceof DomainError ? e.message : 'Action failed; refresh the task and try again.' }); }
    });
    app.view('incident_confirm_modal', async ({ ack, body, view }) => {
      // Validate human action synchronously before acknowledging the modal.
      let confirmation: { incidentId: string; note: string };
      try {
        if (body.team?.id !== this.config.team) throw new DomainError(403, 'Wrong workspace');
        const data = actionSchema.parse(JSON.parse(view.private_metadata));
        const note = view.state.values.confirmation.note.value || '';
        domain.confirm(data.incidentId, data.taskId, body.user.id, 'complete', data.version, note);
        confirmation = { incidentId: data.incidentId, note };
      } catch (e) { await ack({ response_action: 'errors', errors: { confirmation: e instanceof DomainError ? e.message : 'Unable to confirm this action' } }); return; }
      await ack();
      // A notification failure must not acknowledge the same modal twice or undo the saved action.
      await this.send(domain.get(confirmation.incidentId), `<@${body.user.id}> confirmed: ${escapeSlack(confirmation.note)}`).catch(reportError);
    });
    app.action('incident_report', async ({ ack, body }) => {
      await ack(); const b = body as any;
      if (b.team?.id !== this.config.team || b.channel?.id !== this.config.channel) return;
      if (!this.config.supervisors.includes(b.user.id)) return;
      try {
        const { incidentId } = z.object({ incidentId: z.string() }).parse(JSON.parse(b.actions[0].value));
        await agents.enqueue(incidentId, () => agents.run(incidentId, 'records', 'Read all current incident evidence and save a sourced handoff report.'));
        const i = domain.get(incidentId); if (!i.snapshot.reports.length) throw new Error('No report saved');
        await this.send(i, `Handoff report prepared. Review the current tasks and evidence in the dashboard. Open tasks remain open.`, [{ action_id: 'incident_handoff', text: 'Accept handoff', value: JSON.stringify({ incidentId, version: i.snapshot.version }) }]);
      } catch (e) { reportError(e); }
    });
    app.action('incident_handoff', async ({ ack, body, client }) => {
      await ack(); const b = body as any;
      if (b.team?.id !== this.config.team || b.channel?.id !== this.config.channel) return;
      try {
        const data = z.object({ incidentId: z.string(), version: z.number() }).parse(JSON.parse(b.actions[0].value));
        domain.handoff(data.incidentId, b.user.id, data.version);
        await this.send(domain.get(data.incidentId), `Handoff accepted by <@${b.user.id}>. Outstanding tasks remain assigned and visible.`);
      } catch (e) { await client.chat.postEphemeral({ channel: b.channel.id, user: b.user.id, text: e instanceof DomainError ? e.message : 'Handoff failed' }); }
    });
    app.action(/incident_(retry_delivery|run|close)/, async ({ ack, body, client }) => {
      await ack(); const b = body as any;
      if (b.team?.id !== this.config.team || b.channel?.id !== this.config.channel) return;
      try {
        if (!this.config.supervisors.includes(b.user.id)) throw new DomainError(403, 'Supervisor required');
        const action = b.actions[0];
        const data = z.object({ incidentId: z.string(), notificationId: z.string().optional(), version: z.number().optional() }).parse(JSON.parse(action.value));
        if (action.action_id === 'incident_retry_delivery') {
          agents.notifications.retry(data.incidentId, z.string().parse(data.notificationId), b.user.id, true);
          void agents.notifications.pump().catch(reportError);
        } else if (action.action_id === 'incident_run') { void agents.process(data.incidentId).catch(reportError); }
        else await client.views.open({ trigger_id: b.trigger_id, view: {
          type: 'modal', callback_id: 'incident_close_modal', private_metadata: JSON.stringify(data),
          title: { type: 'plain_text', text: 'Close incident' }, submit: { type: 'plain_text', text: 'Confirm closure' },
          blocks: [{ type: 'input', block_id: 'confirmation', label: { type: 'plain_text', text: 'Confirm required work is complete; record your closure evidence' }, element: { type: 'plain_text_input', action_id: 'note', multiline: true, max_length: 2000 } }],
        } });
      } catch (e) { await client.chat.postEphemeral({ channel: b.channel.id, user: b.user.id, text: e instanceof DomainError ? e.message : 'Unable to perform this action' }); }
    });
    app.view('incident_close_modal', async ({ ack, body, view }) => {
      try {
        if (body.team?.id !== this.config.team) throw new DomainError(403, 'Wrong workspace');
        const data = z.object({ incidentId: z.string(), version: z.number() }).parse(JSON.parse(view.private_metadata));
        domain.close(data.incidentId, body.user.id, data.version, view.state.values.confirmation.note.value || '');
      } catch (e) { await ack({ response_action: 'errors', errors: { confirmation: e instanceof DomainError ? e.message : 'Unable to close' } }); return; }
      await ack();
    });
    // Handler errors are not evidence that the transport disconnected.
    app.error(async () => { console.error('Slack handler error; inspect workflow state'); });
  }
  async start(domain: Incidents) { await this.app.start(); domain.setConnection('connected'); }
  async stop(domain: Incidents) { this.summaries?.stop(); await this.app.stop(); domain.setConnection('disconnected'); }
}
