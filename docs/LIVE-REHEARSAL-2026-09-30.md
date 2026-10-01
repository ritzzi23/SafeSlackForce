# Live Slack rehearsal — 30 September 2026

The report-generation and browser follow-up was completed on 1 October; see the
[follow-up verification](FOLLOWUP-2026-10-01.md). The results below preserve what
was observed during the original live Slack run.

The authorized synthetic incident `INC-34B0CDE5` completed the live Slack workflow.
Its final persisted status is **closed**, with all three critical tasks completed.
The run used marker `SSF-LIVE-20260930` and the isolated database
`data/rehearsal-20260930.sqlite`; historical incidents were not replayed.

## Verified behavior

| Check | Observed result |
| --- | --- |
| Initial mention | Created the synthetic incident; five agents ran; tasks, notifications and reports persisted |
| Ordinary thread reply | Reached the runtime without a new mention |
| Reply edit and deletion | Both revisions and the removal persisted; no version of the reply remained active; its dependent fact is disputed |
| Ownership | Ritesh acknowledged each of the three assigned tasks through Slack |
| Task confirmation | All three Slack modals saved explicit synthetic confirmation notes and updated tasks to completed |
| Fresh report | Report 13 saved after the last task confirmation; its evidence/task fingerprint matched the current record |
| Handoff | Ritesh accepted through Slack at 22:25:28 UTC |
| Closure | Ritesh confirmed closure through Slack at 22:28:43 UTC; the Slack summary showed closed and removed current action controls |
| Deliveries | Nine notification receipts persisted and were acknowledged; no pending or uncertain notifications remained |
| Emergency dispatch | Simulation receipt only; no real telephone call or emergency-service contact |

The sole lead, backup and supervisor in the private app configuration are now
Ritesh's Slack account, as requested. Prior notifications sent to Om before the
configuration change remain historical receipts. This changes SafeSlackForce's
role configuration, not Slack workspace membership.

## Model behavior and cost

The rehearsal added **106 OpenRouter calls**, with **$0.1776184** reported/accounted
cost and no unknown costs. There were no Exa calls. These figures exclude the
copied historical usage baseline. The rehearsal retained the configured global
limits and an additional-run ceiling of 150 calls / $1.

The model sometimes attempted to save a report before reading every history page.
The application rejected those saves. Ten of thirteen reports, including report
13, used the explicitly labelled structured fallback containing persisted tasks,
facts, corrections, delivery receipts and the complete timeline. Report delivery
and closure succeeded; reliable model-written narrative for long histories remains
a quality limitation. None of the synthetic notes certify real physical work.

## Display correction found during the run

After human confirmations, the durable tasks and report were current, but Procedure
and Evidence still displayed earlier narratives claiming ownership was unaccepted.
The correction refreshes those summaries from persisted task/evidence state when
human actions occur, while retaining old narratives in activity history. It also
guards against a response begun before the human action replacing the newer state.
Commander text now reflects handoff/closure rather than claiming coordination is
still active. Regression coverage exercises these transitions without model calls.

Final validation: **76 backend tests and 25 frontend tests passed**, along with
typechecks and the production build. After restarting only the isolated rehearsal,
the corrected summaries, completed tasks and finished handoff/closure were verified
through the dashboard's Vite `/api` proxy. The final Chrome visual recheck timed out
during pairing; it is not claimed as passed. The live Slack closure had already
been observed directly before the presentation-only correction.

Local evidence is retained outside the repository in `../review-artifacts/`:
`live-rehearsal-result.json`, `live-rehearsal-handoff.md`, and the read-only
`verify-live-rehearsal.py` exporter. The report is a handoff snapshot; the final
closure confirmation is recorded separately in the incident activity and JSON.

After verification, the temporary API/Slack connection and frontend were stopped,
invalidating the process-only pairing token. The 106 new usage entries were merged
idempotently into the original live usage ledger so future runs account for the
rehearsal's spend. A private database backup was saved before merging; assertions
verified that every historical non-usage entity and timeline event stayed unchanged.
The isolated incident, reports and evidence remain available in the rehearsal store.
