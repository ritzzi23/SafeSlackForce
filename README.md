# SafeSlackForce

**Demo video (2 min):** https://youtu.be/xYKxVzRwwRE · **Presentation:** [docs/SafeSlackForce-Presentation.pdf](docs/SafeSlackForce-Presentation.pdf)

An AI incident coordination team inside Slack, with a live 3D command center.

After a workplace incident, someone has to turn scattered messages into owned tasks,
contact the right people, chase unanswered notifications and prepare a handoff.
SafeSlackForce handles that digital coordination in the incident's Slack thread.
The dashboard shows what the agents are doing, what failed and what still needs attention.

This is a hackathon prototype using synthetic incidents and procedures—not an emergency
service. It does not diagnose injuries, place emergency calls or establish that physical
work has been completed.

[Presentation PDF](docs/SafeSlackForce-Presentation.pdf) ·
[Configuration](.env.example)

## What happens in an incident

1. Mention the bot in the configured Slack channel:
   `@SafeSlackForce SYNTHETIC DEMO: Forklift tipped at Loading Dock B; one person is reported injured.`
   Use the installed bot's actual mention name if it differs.
2. The Commander records reported facts and delegates work. Specialists apply the configured
   demo procedure, review evidence, notify the roster and prepare a sourced handoff report.
3. With autonomous response enabled, management alerts and scheduled status updates run
   without an approval step. Unanswered task notifications can escalate to a configured backup.
4. Replies in the same thread add context. The dashboard displays agent activity, tasks,
   notification results and the incident journey as updates arrive.
5. Download the handoff report, including unresolved work and its owners. A saved report
   does not mean the incident is over.

Slack provides the conversation, participant identities and replies. SQLite stores the
authoritative incident state and audit history. Thread links and QR codes help participants
join the conversation; they still need access to the Slack workspace and channel.

## The agents

| Agent | Work it performs |
|---|---|
| Commander | Records facts, delegates work and asks about missing information. |
| Procedure | Matches the report to a configured procedure and creates owned tasks. |
| Evidence | Saves evidence reviews, flags contradictions and records image observations as unverified. |
| Communications | Notifies the configured roster and manages response actions. |
| Records | Produces versioned Markdown handoff reports with source references. |

Each role has a limited tool set. Server code handles permissions, persistence, timers and
state transitions; those do not need a model. See [agent tools](apps/api/src/agents.ts).

Task ownership and confirmation buttons are available in manual mode. Autonomous mode hides
those controls in the Slack summary so digital coordination can proceed without repeated
approvals. Neither mode lets an agent confirm a physical action on a person's behalf.

## Additional features

- **Voice intake:** browser speech recognition or typed answers to four scripted incident
  questions. The user reviews the record before posting it to Slack. A fixed keyword rule
  shows an emergency warning; this is not medical triage or a telephone service.
- **CopilotKit:** a dashboard copilot that can read incident context, focus agent desks and
  open panels. Sending a question to an incident agent requires an approval card.
- **Exa:** an optional, bounded research endpoint—not an automatic search on every incident.
- **Ambiguous AI:** an optional one-way task and report mirror. Successful operations record
  remote IDs; failures are logged. Editing its board does not confirm physical work here.
- **Synthetic office directory:** optional fixture data for directory lookups. The restricted
  medical/enrollment database is not loaded by the runtime.

## Run locally

Use **Node.js 22 or later**. For a new setup, from the repository root:

```sh
npm ci
cp .env.example .env
openssl rand -hex 24
```

Keep an existing `.env` if you already have one; do not overwrite your credentials.
Put the generated value in `.env` as `DASHBOARD_TOKEN`, then run:

```sh
npm run dev
```

Open **http://localhost:5173**, open the workspace connection dialog, and pair with your token.
The API runs on **http://127.0.0.1:4100**. In the default `fixture` mode, select
**Create offline rehearsal** to exercise the persisted workflow without Slack sends or
incident-agent model calls. The standalone animated demo does not require the API.

Leave provider keys empty for a fully offline rehearsal: the optional copilot can still
make paid requests if its key and model are configured.

## Connect Slack and live agents

1. Create a Slack app using the [app manifest](fixtures/slack-app-manifest.json).
2. Generate an app-level token with `connections:write`, install the app to obtain its bot
   token, and invite the bot to the incident channel.
3. In `.env`, fill in the Slack tokens, workspace/channel IDs and lead, backup and supervisor
   IDs. Add `OPENROUTER_API_KEY` and a tool-capable `SAFESLACKFORCE_MODEL`.
4. Set `SAFESLACKFORCE_MODE=live`, run `npm run doctor`, then start or restart `npm run dev`.
5. Report a clearly labelled synthetic incident and check that Slack and the dashboard show
   the same incident before recording a demo.

Use one backend per demo Slack app to avoid competing Socket Mode consumers. A teammate can
set `BACKEND_URL` to your reachable API origin and run only `npm run dev:web`.

All settings are documented in [`.env.example`](.env.example). Important switches:

- `AUTONOMOUS_RESPONSE_ENABLED`: automatic management alerts and scheduled updates.
- `EMERGENCY_CALL_MODE=simulation`: records a simulated action only for explicitly synthetic
  incidents. No telephone provider is connected; unsupported call actions remain blocked.
- `MODEL_CALL_LIMIT`, `MODEL_BUDGET_USD`: incident-agent call and budget limits.
- `COPILOT_CALL_LIMIT`: separate copilot request cap per server run. Copilot calls use
  OpenRouter but **do not pass through the incident-agent dollar-budget guard**.
- `EXA_ENABLED`, `AMBIGUOUS_ENABLED`, `OFFICE_DEMO_ENABLED`: optional integrations and fixtures.

Keep credentials in the gitignored `.env`, never in the frontend or repository.

## Architecture and limits

Slack Bolt receives events through Socket Mode. A Node.js/Express API validates them and runs
the agents through OpenRouter. SQLite (`sql.js`) persists incident records and events;
Server-Sent Events update the React/Vite dashboard. The 3D room uses React Three Fiber.
Shared Zod schemas live in [`packages/contracts`](packages/contracts).

The server checks tool permissions and versions, deduplicates incoming events and tracks
delivery separately from acknowledgement. Interrupted or uncertain sends remain visible
instead of being silently treated as successful. These are prototype safeguards, not a
claim of production readiness.

The dashboard can be hosted as a static build using [`vercel.json`](vercel.json). The API
needs a long-running process and persistent disk; it is not a Vercel serverless function.
Configure the API proxy, `FRONTEND_ORIGIN` and `DASHBOARD_URL` for your deployment. Temporary
tunnel URLs must be updated when they change. Keep the API online for live Slack coordination.

## Checks and deeper documentation

```sh
npm run test:all          # backend and frontend tests
npm run build             # type checks and production frontend build
npm run doctor            # checks configuration without printing secrets
npm run check:integration # exercises a synthetic rehearsal with servers running
```

Tests are not a substitute for a live Slack rehearsal. Before recording, verify that a
fresh report, notification, thread update and handoff report belong to the same incident
in Slack and the dashboard.

The dashboard's **System design** (`/#system-design`) and **Presentation** (`/#presentation`)
pages open without pairing. For implementation details, start with
[`apps/api/src`](apps/api/src), [`apps/web/src`](apps/web/src) and the
[HTTP routes](apps/api/src/http.ts).

Built by **Om and Ritesh** for the AI Tinkerers **Agents, Everywhere** hackathon,
New York, 12 September 2026.
