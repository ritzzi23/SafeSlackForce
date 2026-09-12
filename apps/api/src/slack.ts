import bolt from '@slack/bolt';
import { z } from 'zod';
import { Agents } from './agents.js';
import { DomainError, type Incident, Incidents } from './domain.js';
import type { Action, Channel } from './notifications.js';
import type { Config } from './config.js';
import type { KnownBlock } from '@slack/types';
const actionSchema = z.object({ incidentId: z.string(), taskId: z.string(), version: z.number().int() });
const escapeSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class SlackChannel implements Channel {
  app: InstanceType<typeof bolt.App>;
  constructor(public config: Config) {
    this.app = new bolt.App({ token: config.botToken, appToken: config.appToken, socketMode: true });
  }
  async send(i: Incident, text: string, actions: Action[] = []) {
    const result = await this.app.client.chat.postMessage({ channel: i.channel, thread_ts: i.rootTs, text,
      blocks: [ { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } },
        ...(actions.length ? [{ type: 'actions', elements: actions.map(a => ({ type: 'button', action_id: a.action_id, text: { type: 'plain_text', text: a.text }, value: a.value })) }] : []),
      ] as KnownBlock[],
    });
    if (!result.ok || !result.ts) throw new Error('Slack did not confirm message delivery'); return result.ts;
  }
  wire(domain: Incidents, agents: Agents) {
    const app = this.app;
    const reportError = (error: unknown) => console.error('Slack workflow error:', error instanceof DomainError ? error.message : 'See failed agent/task status');
    const receive = async (event: any, team: string) => {
      if (team !== this.config.team || event.channel !== this.config.channel || event.bot_id || event.subtype === 'bot_message') return;
      const m = event.subtype === 'message_changed' ? event.message : event.subtype === 'message_deleted' ? event.previous_message : event;
      if (!m || m.bot_id || !m.ts) return;
      const root = m.thread_ts || m.ts;
      let incident = domain.find(team, event.channel, root);
      if (!incident && event.type !== 'app_mention') return;
      if (!incident) {
        incident = domain.create({ team, channel: event.channel, ts: root, user: m.user, text: m.text || '' });
        await this.send(incident, `Created *${incident.snapshot.incidentId}*. Reply in this thread with updates. Only attributed human confirmations complete physical tasks.`);
      } else {
        if (domain.addMessage(incident.snapshot.incidentId, { ts: m.ts, text: m.text || '', user: m.user || 'unknown', deleted: event.subtype === 'message_deleted' }) === false) return;
      }
      const id = incident.snapshot.incidentId;
      void agents.process(id).then(async answer => {
        await this.send(domain.get(id), `*Commander*\n${escapeSlack(answer).slice(0, 2500)}`, [{ action_id: 'incident_report', text: 'Prepare handoff report', value: JSON.stringify({ incidentId: id }) }]);
      }).catch(reportError);
    };
    app.event('app_mention', async ({ event, body }) => { await receive(event, body.team_id || '').catch(reportError); });
    app.event('message', async ({ event, body }) => { await receive(event, body.team_id || '').catch(reportError); });

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
    app.error(async () => { domain.setConnection('disconnected'); console.error('Slack connection/handler error'); });
  }
  async start(domain: Incidents) { await this.app.start(); domain.setConnection('connected'); }
  async stop(domain: Incidents) { await this.app.stop(); domain.setConnection('disconnected'); }
}
