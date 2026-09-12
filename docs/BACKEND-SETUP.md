# Backend implementation and live setup: Om's branch

Branch: `feat/om-backend-agents`. Ritesh owns the frontend; this checkpoint does not
replace his UI. This is a hackathon prototype using a synthetic warehouse procedure,
not a production emergency-response service.

## Run without spending credits

1. Install Node 18.20 or newer and run `npm ci` from the repository root.
2. Copy `.env.example` to an untracked `.env`. Set `DASHBOARD_TOKEN` to a random
   value of at least 24 characters. Keep `SAFESLACKFORCE_MODE=fixture` initially.
3. Run `npm run dev:api`. The API listens on `http://localhost:4100`.
4. Run `npm run typecheck` and `npm test` for the checks.
5. Run `npm run fixtures --silent` for six labelled snapshot states as JSON. Ritesh
   can use this output while building the room, without connecting a model.
   The generated file is also committed at `fixtures/incident-snapshots.json`.
   Regenerate it with `npm run fixtures:write` if the shared contract changes.

Fixture mode never calls a live model or Slack. Notifications appear in the fixture
outbox, not somebody's Slack account. The database persists incident state; the fixture
outbox display is in memory. Never present fixture reasoning as live agent execution.

For a fresh checkout, `npm run configure:sponsors -- /private/path/sponsor-credits.md`
can provision recognized credentials into a new gitignored `.env` with owner-only permissions.
It generates a dashboard token, never prints secret values and refuses to overwrite an
existing `.env`. Redemption codes are not treated as API keys. The current local checkout
has Exa configured this way; Slack and OpenRouter credentials still need to be supplied.

`npm run check:research` performs one fixed-topic Exa search using the persistent cache and
call budget. It can consume credits on a cache miss. Do not run it alongside the API process:
SQLite export in this prototype assumes a single process owns the database.

## Frontend integration

Import types and Zod schemas from `@safeslackforce/contracts`. Use `localhost` consistently
for both frontend and API so session cookies remain same-site. Set `FRONTEND_ORIGIN`
to the actual frontend origin. Do not embed the dashboard pairing token in bundled JS.

Pair once by sending `POST /api/session` with JSON `{ "token": "user-entered token" }`
and `credentials: "include"`. Subsequent fetches also use credentials. This grants a
single demo-coordinator session for eight hours, not production user authentication.
An Authorization Bearer token is also accepted for local scripts.

| Route | Purpose |
|---|---|
| `GET /health` | Mode and connection/configuration indicators |
| `GET /api/incidents` | Incident list |
| `GET /api/incidents/:id` | Authoritative room snapshot |
| `GET /api/incidents/:id/details` | Messages, reported facts and notification receipts |
| `GET /api/incidents/:id/events` | SSE snapshots, event name `snapshot.updated` |
| `POST /api/incidents/:id/agents/:agentId/questions` | Queued agent question |
| `GET /api/requests/:requestId` | Pending, done or failed question result |
| `GET /api/incidents/:id/reports/:reportId` | Private Markdown download |
| `GET /api/usage` | Persistent provider usage accounting |
| `POST /api/research` | Optional fixed-topic Exa search |

Use `new EventSource(url, { withCredentials: true })`. Replay uses `?after=<cursor>`
or the browser's Last-Event-ID. On a new connection load the current snapshot first;
apply only newer versions. For a question send `{ requestId, text, expectedVersion }`,
using a fresh UUID and the displayed snapshot version. A 409 means refresh; retries
with the same request ID and content do not queue duplicate work.

In fixture mode only, create an incident with `POST /api/demo/incidents` and
`{ "text": "Forklift incident at Dock B; one person reported injured." }`.
`GET /api/demo/outbox` displays simulated notification deliveries. Additional fixture
routes for messages, task actions, reports and handoff are in `apps/api/src/http.ts`.

## Connect the real Slack demo

Use a dedicated workspace/channel and synthetic participants only.

- Create a Slack app with Socket Mode enabled and an app-level token with
  `connections:write`. Set `SLACK_APP_TOKEN` and the installed bot's `SLACK_BOT_TOKEN`.
- Import `fixtures/slack-app-manifest.json` when creating the app to prefill scopes,
  events and interactivity. Importing a manifest does not create tokens or invite users.
- Add bot scopes `app_mentions:read`, `channels:history` and `chat:write` for the
  public demo channel. Subscribe to `app_mention` and `message.channels` bot events.
  The manifest additionally includes `channels:read` for the readiness check and
  `files:read` for optional photo ingestion. Remove the latter if you will not use images.
- Enable Interactivity for the acknowledgement buttons and confirmation modal.
- Install/reinstall after changing scopes, and invite the bot to the demo channel.
- Set actual workspace, channel, supervisor, lead and backup Slack IDs in `.env`.
- Set `OPENROUTER_API_KEY` and a tool-capable `SAFESLACKFORCE_MODEL`; then change mode
  to `live`. Startup rejects missing credentials and placeholder Slack IDs.

Socket Mode avoids a public Slack webhook URL. Keep the dashboard local initially.
Mention the bot in a new channel message to create an incident; reply in that thread
to update it. The bot creates owned tasks and dispatches lead notifications through
tools. Sending does not count as acknowledgement. Physical completion requires an
authorized person's confirmation note. A missed acknowledgement notifies the backup.

Use `FOLLOWUP_SECONDS=20` only for a clearly labelled accelerated demo. The default
is 300 seconds, a fixture coordination timer, not a real safety-response standard.

Supervisors can prepare a report and accept handoff from Slack buttons. Handoff is
not incident closure; critical physical tasks stay open until separately confirmed.
Corrections preserve source history and flag dependent work for review.

One bot-authored summary card is refreshed with task versions, specialist findings,
waiting reasons, reports and recovery controls. Delivery attempts are not retried blindly:
a supervisor must inspect Slack and click `Retry (checked Slack)` for uncertain sends.
If the initial summary itself timed out, a supervisor can mention the bot in the same
thread with `retry summary after checking Slack`. Do this only after inspecting for a
delivered copy. Existing cards are updated instead of recreated.

After handoff, `Close with confirmation…` requires a supervisor's written confirmation
and completed critical tasks. A later human update reopens coordination and invalidates
the old handoff; the previous closure remains in the history.

## Voice and photos: backend contract

The Slack-first plan uses typed text or device dictation initially. No paid audio
transcription service is needed. For the optional browser voice composer, Ritesh captures
the transcript, lets the coordinator correct it, then sends:

```text
POST /api/incidents/:id/transcripts
{ requestId, text, expectedVersion, confirmed: true }
GET /api/transcripts/:requestId
```

The backend authenticates the coordinator, relays the confirmed text to the existing
Slack thread, stores its origin, and runs Commander. It does not mark any physical task
complete. Request IDs deduplicate resubmission. After an uncertain send, inspect Slack
before creating another request ID. This endpoint accepts reviewed text, not raw audio;
the microphone UI and browser speech support belong to Ritesh.

Photo ingestion requires `SLACK_FILES_ENABLED=true` and the installed `files:read` scope.
Upload synthetic PNG/JPEG/WebP files in the tracked incident thread. The server retrieves
metadata through Slack, restricts downloads to `https://files.slack.com`, rejects redirects,
checks raster signatures and limits each image to 3 MiB and each incident to four images.
The authenticated endpoint is `GET /api/incidents/:id/attachments/:fileId`.
Deleting the source message revokes file access and flags affected evidence for review.

`VISION_ENABLED=true` plus an image-input-capable `VISION_MODEL` exposes `inspect_image`
to Evidence only. This uses the same OpenRouter allowance, caches observations and never
completes a task. Observations are explicitly unverified, not injury diagnoses or safety
clearances. Leave vision disabled for normal frontend work; it has no separate free budget.

## Rehearsal reset and readiness

`POST /api/demo/reset` with `{ "confirmation": "ARCHIVE FIXTURE INCIDENTS" }` archives
fixture incidents once agent queues are idle. It does not delete records or reset usage.
The endpoint is unavailable in live mode. Create a fresh incident after resetting.
For live rehearsals use a fresh Slack root message; do not delete the database to reset.

Run `npm run doctor` to list missing configuration without printing secrets.
After configuration, `npm run doctor -- --live` checks Slack bot/workspace/channel access
and model catalog support using read-only requests. It does not run inference, validate
the app-level Socket token, validate the OpenRouter key, or prove interactive delivery.
Those still require the live rehearsal in [Om's readiness checklist](OM-BACKEND-READINESS.md).

## What is verified and what remains

Automated checks exercise all five agent tool paths with a scripted model, fixture
coordination, permissions, stale versions, corrections, notification recovery, persistence,
report freshness, API pairing, SSE, voice relay, media restrictions and credit accounting.
They do not establish real Slack delivery or a selected model's quality. Live credentials,
app installation and a two-person rehearsal are still required.

Ritesh owns UI/3D and browser input controls, not any agent implementation. The implemented
procedure remains the agreed synthetic warehouse fixture; deployment to another real site
requires that site's approved procedure and roster. Avoid real incident or medical data;
the demo has shared coordinator access, not production identity controls.

See [credit budget](CREDIT-BUDGET.md) before turning on paid providers.

Implementation references: [Slack message updates](https://docs.slack.dev/reference/methods/chat.update/),
[Slack file objects](https://docs.slack.dev/reference/objects/file-object/),
[OpenRouter image inputs](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding).

### Existing installations

Use `SAFESLACKFORCE_MODE` and `SAFESLACKFORCE_MODEL` in new configuration. The
legacy `INCIDENTOS_MODE` and `INCIDENTOS_MODEL` variables remain accepted when
the corresponding new variable is absent. Existing `data/incidentos-*.sqlite`
databases are reused when a new-name database does not exist, preserving incident
history and the spending ledger. An explicit `DATABASE_PATH` takes precedence.

The Slack manifest names both the app and bot **SafeSlackForce**. For an installed
app, update its display name and bot display name in Slack app settings, and use
`#safeslackforce-demo` as the demo channel name. Channel IDs stay unchanged when
renamed, so the backend configuration continues to work.
