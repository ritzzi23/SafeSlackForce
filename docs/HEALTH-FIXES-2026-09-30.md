# Repository health fixes — 30 September 2026

All confirmed code defects from the repository review have been corrected. The
fresh live Slack rehearsal subsequently completed incident `INC-34B0CDE5` through
task confirmation, a current report, accepted handoff and explicit closure. See
[the live rehearsal record](LIVE-REHEARSAL-2026-09-30.md) for evidence, usage and the
additional summary freshness correction discovered during the run.
The subsequent [1 October follow-up](FOLLOWUP-2026-10-01.md) completed browser
verification and improved long-history report generation; the suite now contains
80 backend and 25 frontend tests.

## Changes

- Human ownership, completion, review, handoff and closure controls remain
  available when autonomous response is enabled. Automatic notifications and
  reports still run without waiting for ownership acceptance; domain permissions
  and human confirmation requirements are unchanged.
- Slack deletion events use their own revision timestamp, so deleting a previously
  edited message invalidates sourced facts, dependent tasks and attachments. Older
  edits cannot revive deleted evidence.
- Initial reports made inside existing threads preserve the reply's message ID and
  source URL separately from the thread root. Edits, deletions and initial image
  ingestion now address the actual report.
- Slack report preparation uses the guarded `prepareReport` path. It announces
  success only after the current request saves a fresh report. Autonomous mode can
  still produce the labelled structured fallback when model narration fails.
- Dashboard snapshot requests honor the latest user selection and cannot replace
  a newer event snapshot with an older response. Obsolete stream callbacks are
  ignored, submission pauses while switching, and drafts are cleared when incident
  context changes. Re-pairing preserves events arriving during snapshot refresh.
- Waiting and active workspaces recover from expired sessions by offering pairing.
  The waiting office also exposes workspace settings. Temporary connectivity errors
  retry without treating the session as expired.
- Shared validation requires exactly one of each of the five agents.
- The live doctor checks granted Slack permissions in addition to identity and
  channel membership. Setup documentation now consistently requires Node 22+ and
  explains installed event subscriptions and the single-runtime requirement.

The mounted React regressions use jsdom as a development-only dependency. Existing
private configuration and live databases were preserved; historical incident
records were not rewritten or deleted.

## Verification

| Check | Result |
| --- | --- |
| Backend suite | 76 passed, including five tests through Bolt's actual event/action dispatcher and three summary freshness regressions |
| Frontend suite | 25 passed, including mounted asynchronous/session regressions |
| Typechecks and production build | Passed |
| Fixture integration through Vite | Passed: pairing, persistence, stale guards, agent answer, report, SSE and reviewed update |
| Provider usage for fixture integration | Zero model and Exa calls |
| Desktop Chrome | Pairing, rendering, incident switching, empty draft after switching and paired refresh verified; no captured console warnings/errors |
| Dependency installation audit | Zero known vulnerabilities reported |
| Read-only live doctor | Bot identity, workspace, granted scopes, channel membership and model catalog tool support passed |
| Temporary Socket Mode handshake probe | Passed; one connection including the probe, zero other connections; probe closed afterward |

The additional backend regressions cover both autonomy settings, the complete
human confirmation/closure path, edited-message deletion, reply-source identity
and attachments, and misleading report-completion claims. Frontend regressions
exercise actual mounted components with deferred requests and event callbacks.

The Slack handler checks use Bolt's actual event/action dispatcher, an in-memory
receiver, synthetic identities and mocked outbound methods. They verify ordinary
thread replies and corrections, the autonomous summary's complete button/modal
workflow, unauthorized/stale actions, single modal acknowledgement after a
notification failure, and error feedback when report generation saves nothing.
They use no Slack credentials, network delivery or model inference.

## Live acceptance check — completed

The second connection recorded on 12 September was not present during the current
probe. The user also confirmed only this copy is running. The checked-in Slack
manifest includes `app_mention`, `message.channels`, Socket Mode and Interactivity.

The installed app's event-subscription configuration could not be inspected from
the app-management page. Actual delivery was then verified through the authorized
synthetic rehearsal: a mention created the incident, an ordinary thread reply and
its edit/removal reached the runtime, and Slack buttons/modals persisted ownership,
completion, report preparation, handoff and closure. The earlier read-only checks
used no inference; the later live rehearsal consumed 106 model calls ($0.1776184).

The following acceptance sequence was exercised using one isolated live server
and a synthetic incident in the configured demo channel:

1. Mention the app with `SYNTHETIC TEST: forklift incident at Dock B`. Verify a new
   incident, owned tasks and a summary appear in the same thread and dashboard.
2. Reply in the thread without mentioning the app: `SYNTHETIC TEST: lead is
   checking Dock B`. Verify that exact new source arrives. Edit it to `SYNTHETIC
   TEST: correction, lead has not arrived`, then delete only that test reply.
   Verify the current evidence reflects the edit and removal.
3. As the configured lead, accept assigned tasks and confirm each with an explicit
   synthetic test note. As the configured supervisor, prepare a fresh report,
   accept handoff and close the incident with a synthetic closure note. Verify
   each saved task state and the final closed state in the dashboard.

This rehearsal posts messages and confirmations to Slack and may consume the
configured model allowance. Historical incidents and unrelated messages should
not be used as test data.

Use a single API writer with durable database storage and a same-origin API proxy.
These remain deployment requirements of the SQL.js architecture. Slack's behavior
with multiple clients is described in its
[Socket Mode documentation](https://api.slack.com/apis/connections/socket).

Run local checks from the repository root:

```sh
npm run test:all
npm run build
npm run doctor -- --live
```

`npm run check:integration` requires a running **fixture-mode** API and frontend and
creates synthetic local data. Do not point it at the live store.
