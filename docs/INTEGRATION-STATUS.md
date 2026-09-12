# Main-branch integration — 12 September 2026

Om's backend branch and Ritesh's `feat/ritesh-office-ui` (including his SafeSlackForce
branding update `1dda5bd`) are merged on `main`.
Ritesh's scene and layout are retained. Om owns all runtime agents, tools,
Slack behavior, state and APIs; Ritesh owns frontend presentation.

## Integrated

- One root workspace and lockfile; Node 22+; `npm ci`, `npm run dev`.
- Browser pairing with a private HTTP-only session. Existing pairing restores
  after refresh; dashboard tokens are never bundled or stored in browser storage.
- Canonical snapshots drive all five desks, tasks, timeline and Slack-source panel.
- SSE updates, versioned agent questions, polling and report downloads use the API.
- Empty offline workspaces offer a persisted synthetic rehearsal after pairing.
- Explicit standalone demo / backend fixture / live mode labels.
- Separate default fixture/live databases and a mixed-mode startup guard prevent
  fixture notifications from being sent through real Slack later.
- Private local Slack configuration: Om is supervisor and backup, Ritesh is lead.
  No personal IDs or credentials are required in tracked source files.

## Verification and remaining boundaries

`npm run test:all` runs backend and frontend regression tests. `npm run build`
typechecks the backend and builds the frontend. `npm run check:integration`
uses the real frontend API adapter through the running Vite proxy: private
session, persisted fixture, owned tasks, sources, stale-version rejection,
queued Records answer, Markdown download and SSE replay. It creates one labelled
fixture incident and does not call external providers.

Final check: **25 backend tests + 11 frontend tests passed**, production build
passed, and the running frontend-proxy integration check passed, including reviewed
update relay. Provider usage for this rehearsal remained zero.

Slack bot authentication and public demo-channel membership have been verified.
Both configured human members are also in the demo channel. The installed Slack
app still has its existing **IncidentOS Demo** name in **#incidentos-demo**; product
branding changes do not rename external Slack resources or require reinstalling.
App-token connection-URL creation was verified earlier; that is not a completed
Socket Mode end-to-end rehearsal. Live startup still requires an OpenRouter API
key and a tool-capable model. Do not call this production ready or a verified live
agent workflow until actual Slack report/acknowledgement/follow-up tests pass.

Browser automation was unavailable during this integration pass. Production build
and HTTP integration passed, but rendered desktop/mobile visual QA and click-through
testing remain to be performed in a connected browser. Session restoration was
implemented; its browser-level behavior still needs that check.

The UI exposes text agent questions, source messages, reviewed voice/text incident
updates and protected attachment links with explicitly unverified observations.
Microphone capture uses browser speech recognition when available, with a typed
fallback and explicit review before dispatch. Real microphone behavior and Slack
image ingestion still need browser/live verification. Physical confirmations and handoff/closure
remain human actions in Slack, not buttons that agents can approve themselves.

## Local walkthrough

1. Use Node 22+, run `npm ci`, then `npm run dev` from the repository root.
2. Open http://localhost:5173 (must match `FRONTEND_ORIGIN`).
3. Settings → enter `DASHBOARD_TOKEN` from your private `.env` → Pair workspace.
4. Choose **Create offline rehearsal**, or load an existing fixture incident.
5. Select Records and ask for a handoff; inspect tasks, activity, source messages
   and the report download. This is a persisted fixture run, not model inference.
6. Before live testing, add `OPENROUTER_API_KEY` and `INCIDENTOS_MODEL` privately,
   inspect spending settings, set `INCIDENTOS_MODE=live`, and restart.
7. Leave `DATABASE_PATH` empty so live mode uses its own database. Old databases
   are preserved; never copy synthetic incidents into a live store.
8. Run `npm run doctor -- --live`; then use the Slack rehearsal in
   [backend readiness](OM-BACKEND-READINESS.md). A live key check does not replace
   actual report → notification → human acknowledgement → sourced handoff testing.

No credentials, local databases, or generated frontend bundles are pushed.
