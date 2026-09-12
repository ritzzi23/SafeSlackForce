# Om's backend: implemented versus externally verified

12 September 2026. Scope: the agreed Slack-first hackathon backend. This document is not
a production-readiness certification or proof that a real emergency can rely on this tool.

## Outcome

Backend implementation is present on `feat/om-backend-agents`. Twenty-four automated tests,
TypeScript checks and the dependency audit pass. The actual API entry point was started in
fixture mode, created an incident with three tasks and reported zero provider calls.

Live operational acceptance is still pending. A private, gitignored `.env` now contains a
generated dashboard pairing token and the authorized Exa credential. One real public-reference
Exa search succeeded, returned an OSHA source and reported $0.007; its result and usage are
cached in local SQLite. The supplied sponsor notes contained no Slack app/bot credentials or
OpenRouter API key. No real Slack send, model inference or vision inference has been verified.

## Om's code ownership checklist

| Area | Implemented | Verification |
|---|---|---|
| Commander plus four specialists | Role-specific tools, evidence reads, delegation and explicit failures | Scripted-model test exercises all five real tool paths |
| Procedure | Scope-checked fixture lookup, owned tasks, idempotence | Tests reject unrelated incidents |
| Evidence | Sourced facts, conflicting-task review, correction invalidation | Tests cover source removal and targeted contradiction |
| Communications | Outbox, delivery receipt, acknowledgement, backup follow-up, controlled retry | Tests cover missed/timely acknowledgement and uncertain delivery |
| Records | Timeline reads, sourced reports, report freshness, human handoff and closure | Tests cover open work, stale reports and closure evidence |
| Slack | Socket Mode adapter, envelope deduplication, threads, refreshed card, buttons and modals | Intake and summary transports tested; live workspace rehearsal pending |
| Storage | SQLite, ordered snapshots/events, interrupted-work status and persistent usage | Restart and replay tests |
| Dashboard backend | Paired demo session, snapshots, SSE replay, questions and private reports | HTTP tests and entry-point smoke check |
| Voice backend | Confirmed transcript relay to Slack, identity label and idempotency | HTTP test; frontend microphone is Ritesh's work |
| Photo backend | Slack metadata/download, restricted raster proxy, optional budgeted vision tool | Mocked-download tests; live Slack/vision configuration pending |
| Provider controls | Bounded OpenRouter calls/cost accounting; opt-in cached Exa | Mocked provider tests; one live Exa search verified for $0.007 |
| Developer handoff | Shared types, six generated fixture states, manifest, doctor and setup notes | Fixtures validated against shared schema |
| Demo reset | Archive fixtures while retaining history and provider accounting | HTTP test verifies budget survives |

## External steps still required from Om

1. Create/install the Slack app using `fixtures/slack-app-manifest.json`.
2. Enable Socket Mode, create the app token with `connections:write`, and obtain the bot token.
3. Invite the bot and both demo participants to the configured public channel.
4. Fill the remaining `.env` fields locally with workspace/channel/role IDs, Slack tokens,
   OpenRouter API key and model. The pairing token and Exa key are already configured locally.
   Do not put these values in Git, screenshots, frontend code or shared chat.
5. Set a provider-side spending limit, check actual credit balance, and keep the first
   application allowance at $1. Select a current tool-capable model; select a separate
   vision-capable model only if images will be demonstrated.
6. Run `npm run doctor`, then `npm run doctor -- --live`, then `npm run dev:api` in live mode.
7. Perform the acceptance sequence below with two actual Slack users.

These steps cannot be completed by declaring the code finished. Credentials and workspace
installation are not implied by a successful local test suite.

## Required two-person acceptance sequence

1. Om mentions the bot: `Forklift incident at Loading Dock B. One person is reported injured.`
2. Confirm a single incident, a single updating summary card and three sourced tasks.
3. Check the lead receives a real Slack notification. Observe no automatic acknowledgement.
4. Ritesh replies `The site medic is on the way`. External emergency-service contact must
   remain unconfirmed; assigned physical tasks must not become completed.
5. Let the labelled demo timer expire once; verify only one backup follow-up.
6. A configured responder accepts ownership through Slack. Confirm the changed owner/version.
7. Post conflicting area-status observations. Evidence should cite both and flag only
   the relevant task. Ask the Evidence desk why via the dashboard when available.
8. Correct one source message and verify the earlier text is retained as superseded.
9. Prepare a report, inspect unresolved work and source references, then accept handoff
   as supervisor. Handoff must not silently complete physical actions.
10. Verify unauthorized users cannot confirm/close and that stale buttons are rejected.
11. If demonstrating photos, upload one synthetic image and verify access and budget;
    delete its source and confirm that access is revoked. Never use real patient images.
12. Check `/api/usage` against provider usage after rehearsal; reserve credits for the demo.

## Boundary with Ritesh

Ritesh builds and connects the UI, room, avatars, inspector, microphone control and rendering
of backend states. He does not implement models, tools, agent orchestration, Slack actions,
image analysis, notification logic or persistence. All those code paths live under Om's API.

The current deployment is one local long-running process. An externally hosted frontend needs
a reachable backend and deliberately configured HTTPS/cookie routing; a Vercel UI by itself
does not run this Socket Mode service. That infrastructure integration remains to be chosen
with Ritesh if a shared hosted demo is required.
