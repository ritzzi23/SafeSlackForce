# Agentic coordination with fewer human interruptions

The human supplies facts and confirms physical actions; agents perform the authorized digital coordination. A person should not have to request every lookup, delegation, notification or draft.

## Changed behavior

- Commander instructions explicitly call for executing authorized digital steps without asking permission each time.
- Once agent work settles and open tasks have owners, Autopilot invokes Records to read evidence and prepare a sourced handoff automatically. Tasks need not be completed or even acknowledged before a draft is prepared.
- Relevant evidence, task or delivery updates invalidate the report and trigger an automatic revision. Agent animations/status-only changes do not create new report revisions.
- The existing Slack summary publishes report-ready status and the human handoff action. No separate “prepare report” click is required in the normal path; that control remains for explicit retries.
- One **Accept my assigned tasks** Slack button acknowledges all currently assigned/proposed tasks owned by the person clicking. It neither claims other people's tasks nor bypasses review. Already acknowledged tasks no longer display redundant accept buttons in the summary.
- Existing automatic missed-acknowledgement follow-ups remain in place.

## Boundaries and budget

An agent still cannot certify injury severity, medical treatment, physical completion, site safety, external telephone contact, final handoff acceptance or incident closure. Writing a report is not equivalent to resolving an incident.

Auto-report attempts are limited to four per incident, persisted before execution and subject to existing provider call/spend caps. Unchanged failed attempts are not retried automatically. Additional revisions require an explicit Records request or the existing report control. This is a safety/budget limit, not a provider-cost guarantee.

Updates coalesce over 1.5 seconds. Work waits for queued agents to settle. Self-generated report/agent-status events do not create an infinite loop. Closed, archived and handed-over incidents are excluded. After human handoff, preparing another report remains explicit to avoid silently reopening the accepted handoff.

Autopilot listens to new runtime events; it does not scan old incidents and spend credits merely because the server restarted. No phone dialer, autonomous clinical decision or broadened Slack recipient permission was added.

## Verification

Synthetic tests cover automatic creation/refresh, unchanged-event deduplication, batch authorization and stale versions, failure/cap persistence, concurrent ticks, unowned tasks, shutdown and handed-over exclusions. Live Slack/browser rehearsal is still necessary. The project was left stopped during this change, as requested; no external provider calls were made.
