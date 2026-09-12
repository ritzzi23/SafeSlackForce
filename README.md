# SafeSlackForce

SafeSlackForce is a Slack-first incident coordination system
with a central Commander agent, specialist agents, and a live 3D command center.

## Autonomous response and shared incident thread

With `AUTONOMOUS_RESPONSE_ENABLED=true`, a reported incident immediately notifies
configured management (`SLACK_SUPERVISOR_USER_IDS`), schedules an incident follow-up,
and runs the Commander and specialists. Database lookup, sourced evidence extraction,
notifications and report generation do not wait for task ownership acceptance.
The Commander can use `manage_response` to reschedule a pending follow-up (30–3600
seconds). Due updates run from persisted schedules, including for acknowledged but
incomplete tasks. Delivery receipts, unknown outcomes and scheduled work appear in
the **Autopilot** action log and reports. An uncertain send is not blindly duplicated.

Use **Join this incident** above the office to open the shared Slack thread, copy
its link, or download a scannable QR. Participants with access to the workspace and
channel reply in that thread; their observations and corrections automatically
trigger coordination. The QR uses the Slack URL, never a localhost dashboard URL.

`EMERGENCY_CALL_MODE=simulation` records a clearly labelled simulated dispatch for
explicitly synthetic incidents. **No real emergency call is placed.** The office
directory contains fictional contacts and no callable telephone numbers. Real
calling still requires a provider integration, verified site routing and actual
contact numbers. Unconfigured calls remain blocked while other digital work proceeds.
Agent actions cannot establish that physical work happened or emergency services
arrived; those outcomes need evidence. Report generation itself has no approval gate.
If model narration fails, autonomous mode still saves a clearly labelled structured
report from persisted evidence, tasks, receipts and the complete timeline.

`AUTO_REPORT_LIMIT=20` bounds automatic revisions per incident; the global model
call and dollar limits still apply. The older ownership/handoff controls remain
available for recording real-world responsibility and final closure.

The current product, architecture, Slack workflow, frontend direction, and Om/Ritesh work split
are documented in [the implementation plan](docs/SAFESLACKFORCE-SLACK-BUILD-PLAN.md).

For the direct ownership checklist and integration checkpoints, use the
[separate build split](docs/BUILD-SPLIT.md).

Both Om's backend and Ritesh's frontend are integrated on `main`. Start with the
[backend setup and frontend API contract](docs/BACKEND-SETUP.md) and
[OpenRouter/Exa credit budget](docs/CREDIT-BUDGET.md).

For the exact implementation status and remaining live setup, see
[Om's backend readiness checklist](docs/OM-BACKEND-READINESS.md).
Ritesh owns only frontend/UI; all agent and backend logic is under `apps/api`.

## Run the integrated project

Use **Node 22+** (`nvm use` if available). From the repository root:

```sh
npm ci
# Create a private .env from .env.example if you do not already have one.
# Set DASHBOARD_TOKEN to a random secret of at least 24 characters.
npm run dev
```

Open **http://localhost:5173**. One command starts the frontend on 5173 and API on
4100. Keep `.env` private and gitignored. Use the settings icon to pair with
`DASHBOARD_TOKEN` from your local `.env`. Sessions restore on refresh without
storing the token in browser storage. In fixture mode, choose **Create offline
rehearsal** after pairing to exercise persisted backend state. The standalone
animated demo is separate and labelled; neither performs live Slack delivery or
model inference.

```sh
npm run test:all
npm run build
npm run check:integration  # servers must be running; saves one synthetic rehearsal
npm run doctor            # reports missing live configuration without secrets
```

Before live use, configure the Slack tokens, workspace/channel/role IDs,
`OPENROUTER_API_KEY` and a tool-capable `SAFESLACKFORCE_MODEL`, then set
`SAFESLACKFORCE_MODE=live` and restart. Leave `DATABASE_PATH` blank to select separate
fixture/live databases. Mixed-mode databases are rejected before any dispatch.
Set `FRONTEND_ORIGIN` and `DASHBOARD_URL` to the exact URL you open.

Deployment requires a persistent API process and same-origin `/api` proxy; the
frontend bundle alone is insufficient. See [integration status](docs/INTEGRATION-STATUS.md)
for checks and remaining live setup.
