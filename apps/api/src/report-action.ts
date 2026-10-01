import { Agents } from './agents.js';
import { DomainError, Incidents } from './domain.js';
import type { Channel } from './notifications.js';

/** Announce report preparation only after this request saves a current report. */
export async function publishHandoffReport(domain: Incidents, agents: Agents, channel: Channel, id: string) {
  await agents.enqueue(id, async () => {
    const previous = domain.get(id).snapshot.reports.at(-1)?.id;
    await agents.prepareReport(id, 'Read all current incident evidence and save a sourced handoff report.');
    const incident = domain.get(id);
    const report = incident.snapshot.reports.at(-1);
    const blockers = domain.readiness(id).handoff.blockers;
    if (!report || report.id === previous || incident.snapshot.status !== 'handoff_ready' || blockers.some(b => b.code === 'REPORT_STALE')) {
      throw new DomainError(409, 'A fresh handoff report was not saved. Inspect Records and retry report preparation.');
    }
    await channel.send(incident, 'Handoff report prepared. Review the current tasks and evidence in the dashboard. Open tasks remain open.',
      blockers.length ? [] : [{ action_id: 'incident_handoff', text: 'Accept handoff', value: JSON.stringify({ incidentId: id, version: incident.snapshot.version }) }]);
  });
}
