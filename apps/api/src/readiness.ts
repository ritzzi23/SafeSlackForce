import type { Incident } from './domain.js';

export type Blocker = { code: string; message: string; taskIds: string[] };

// Shared by the read-only explanation and the mutation guards: UI is not authority.
export function handoffBlockers(i: Incident, reportCurrent: boolean): Blocker[] {
  const blockers: Blocker[] = [];
  if (i.snapshot.status !== 'handoff_ready') blockers.push({ code: 'HANDOFF_REPORT_REQUIRED', message: 'Generate a current handoff report first', taskIds: [] });
  if (!i.snapshot.reports.length) blockers.push({ code: 'REPORT_MISSING', message: 'Generate a report first', taskIds: [] });
  else if (!reportCurrent) blockers.push({ code: 'REPORT_STALE', message: 'Report is stale; regenerate before handoff', taskIds: [] });
  const unowned = i.snapshot.tasks.filter(t => !t.owner && !['completed', 'cancelled'].includes(t.status));
  if (unowned.length) blockers.push({ code: 'OPEN_TASKS_UNOWNED', message: 'Open tasks require owners', taskIds: unowned.map(t => t.id) });
  return blockers;
}

export function closureBlockers(i: Incident): Blocker[] {
  const blockers: Blocker[] = [];
  if (i.snapshot.status !== 'handed_over') blockers.push({ code: 'HANDOFF_NOT_ACCEPTED', message: 'Accept the handoff first', taskIds: [] });
  const critical = i.snapshot.tasks.filter(t => i.criticalTaskIds.includes(t.id) && t.status !== 'completed');
  if (critical.length) blockers.push({ code: 'CRITICAL_TASKS_OPEN', message: 'Critical tasks are still open', taskIds: critical.map(t => t.id) });
  return blockers;
}
