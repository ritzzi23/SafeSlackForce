# Action explainability

Implemented independently on `feat/action-explainability`. Main and its running live instance are unchanged.

## Inspiration and scope

The explicit denial reasons and downstream-stage blocking in [midnightx402](https://github.com/dhru7777/midnightx402/tree/dheeraj/dev) inspired this feature. No source code or assets were copied. That repository is MIT-licensed; its blockchain, payment, reputation and authorization mechanisms are not imported here.

SafeSlackForce now explains its existing coordination rules instead of adding another agent or provider request:

- Tasks tab: “What happens next?” shows handoff and closure prerequisites.
- Blockers name affected tasks, with stable reason codes.
- Delivery details distinguish sent, uncertain, acknowledged and completed states.
- Open owned tasks can transfer during handoff. They are not incorrectly treated as mandatory completion dependencies.
- Every critical task must be completed for closure; cancelling a critical task does not satisfy that rule.
- A supervisor remains necessary for handoff and closure; closure still needs a note. Readiness never grants permission.

## Contract and safeguards

Authenticated `GET /api/incidents/:id/readiness` returns the incident ID, snapshot version, gates, task explanations and limited delivery receipts. It does not mutate state, dispatch messages or call models. Existing task cards retain attributed evidence links.

`apps/api/src/readiness.ts` supplies the same prerequisite functions to the actual handoff/closure mutations and the read-only endpoint. Actor authorization, version checks and closure-note validation remain enforced separately on mutations.

The frontend cancels obsolete requests, hides previous-incident/previous-version results, validates the response schema, and offers retry if unavailable. This is an operational-state explanation, not independent verification of physical actions or a safety assessment.

## Verification

Run `npm run test:all` and `npm run build` using Node 22. Tests use synthetic in-memory incidents and local HTTP requests; no Slack, Exa or OpenRouter credentials are needed.

Manual check after deliberately starting this branch in an isolated fixture environment: pair the dashboard, create a fixture incident, open Tasks, inspect handoff/closure prerequisites and delivery details, and follow the existing human-confirmation workflow. Do not run two live Socket Mode instances with shared credentials or reuse the live database for fixture tests.

No dependencies, blockchain components, payments or model calls were added. Browser visual QA is still required before merging.
