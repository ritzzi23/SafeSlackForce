# Visible journey and notifications

The office now has an incident journey strip: Intake, Assign, Contact, Responses, Draft and Handoff. Each stage opens its evidence panel. These are overlapping milestones, not a fabricated progress percentage or a mandatory sequential dependency chain. Open owned tasks can be handed over without physical completion.

The strip shows active agents and failed/blocked work. Lost SSE transport is labelled as a last-known snapshot. A compact copy remains visible in the mobile inspector where the office is hidden.

The bell in the left navigation opens Notifications & responses. It shows recipient, message, delivery state, acknowledgement, follow-up deadline and provider receipt. Filters separate outstanding responses from delivery failures/uncertainty. Recent persisted activity is shown below. Missing or loading receipts remain unavailable, never silently rendered as success. React escapes message content; Slack URLs use the existing URL sanitizer.

The authenticated readiness endpoint now includes optional notification text, follow-up flag, deadline and error. It does not add new dispatch actions. Current incident/version checks and cancellation prevent old fetched evidence from appearing under a new incident. Existing preloaded snapshots remain the authority for tasks and lifecycle status.

## CopilotKit starter review

Reviewed https://github.com/CopilotKit/agents-everywhere-starter-kit on 12 September 2026, particularly:

- `apps/channel/src/components.tsx`: structured incident cards, source-context fields and an ordered timeline.
- `apps/web/src/components/streamed-cards.tsx`: explicit loading placeholders when structured arguments are incomplete.
- `apps/channel/src/delivery.test.tsx`: tool failure must remain visible even if the agent finishes its response; delivery completion is not tool success.
- README: separate Slack/web/mobile templates, optional managed onboarding and explicit reuse/submission guidance.

The useful application here is clear structured state, timeline visibility and honest loading/failure labels. The components above were implemented independently using SafeSlackForce's existing snapshots, SSE and authenticated APIs. No starter source/assets were copied and no CopilotKit dependency or managed service was installed. A framework migration, managed Channel onboarding or mobile app would be a separate decision, not a requirement for this UI improvement. Existing credential configuration is unchanged.

Checks: unit/server-rendering tests cover milestone semantics, unknown receipts, failure visibility, disconnected transport and escaped notification text. Build/typechecking must pass. Browser connection was unavailable during implementation, so visual desktop/mobile click-through remains unverified. The Slack server and project remain stopped; no provider calls were made.
