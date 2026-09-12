# Backend checkpoint: Om's branch

Branch: `feat/om-backend-agents`. Ritesh owns the frontend; this checkpoint does not
replace his UI. This is a hackathon prototype using a synthetic warehouse procedure,
not a production emergency-response service.

## Run without spending credits

1. Install Node 18.20 or newer and run `npm ci` from the repository root.
2. Copy `.env.example` to an untracked `.env`. Set `DASHBOARD_TOKEN` to a random
   value of at least 24 characters. Keep `INCIDENTOS_MODE=fixture` initially.
3. Run `npm run dev:api`. The API listens on `http://localhost:4100`.
4. Run `npm run typecheck` and `npm test` for the checks.
5. Run `npm run fixtures --silent` for six labelled snapshot states as JSON. Ritesh
   can use this output while building the room, without connecting a model.

Fixture mode never calls a live model or Slack. Notifications appear in the fixture
outbox, not somebody's Slack account. The database persists incident state; the fixture
outbox display is in memory. Never present fixture reasoning as live agent execution.

## Frontend integration

Import types and Zod schemas from `@incidentos/contracts`. Use `localhost` consistently
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
- Add bot scopes `app_mentions:read`, `channels:history` and `chat:write` for the
  public demo channel. Subscribe to `app_mention` and `message.channels` bot events.
- Enable Interactivity for the acknowledgement buttons and confirmation modal.
- Install/reinstall after changing scopes, and invite the bot to the demo channel.
- Set actual workspace, channel, supervisor, lead and backup Slack IDs in `.env`.
- Set `OPENROUTER_API_KEY` and a tool-capable `INCIDENTOS_MODEL`; then change mode
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

## What is verified and what remains

Automated checks exercise fixture coordination, permissions, stale task versions,
corrections, follow-up deduplication, persistence, report freshness, API pairing,
SSE and model-tool boundaries. They do not establish real Slack delivery or a selected
model's quality. Live credentials and a two-person rehearsal are still needed.

The wider plan remains intact. UI/3D wiring belongs to Ritesh; voice, photo ingestion,
expanded procedures and live end-to-end acceptance need subsequent checkpoints.
Do not describe these as completed by this backend commit. Avoid real incident or
medical data; the demo has shared coordinator access, not production identity controls.

See [credit budget](CREDIT-BUDGET.md) before turning on paid providers.
