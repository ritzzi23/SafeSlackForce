# SafeSlackForce Build Split

## Shared objective

Deliver one working flow:

```text
Slack report
  -> Commander delegates work
  -> specialist agents produce stored results
  -> a person acknowledges or corrects an update in Slack
  -> the 3D office reflects the real state
  -> Records generates a sourced handoff report
```

Om owns the Slack, backend, data, agent and tool layers. Ritesh owns the browser interface,
3D command center and frontend integration. The API contract and fixture data are shared.

## Om: backend and agents

### Slack integration

- Create the Slack app and configure Socket Mode.
- Receive incident reports from the configured channel.
- Map each root Slack message and its thread to one incident.
- Receive human replies, corrections and interactive-button actions.
- Post Commander summaries and specialist findings into the same thread.
- Implement task acknowledgement and handoff buttons.
- Filter bot messages and deduplicate Slack retries and overlapping events.
- Store Slack tokens only in server environment variables.

### Incident backend

- Build the Node.js and TypeScript server.
- Store incidents, participants, facts, tasks, messages, notifications and reports in SQLite.
- Implement incident and task state transitions.
- Preserve corrections as events instead of overwriting history.
- Enforce configured Slack user roles for restricted actions.
- Implement notification delivery, missed-acknowledgement follow-up and retry handling.
- Expose incident snapshots, direct-agent questions, report downloads and an SSE event stream.
- Supply a repeatable demo reset and synthetic procedure, roster and incident fixtures.

### Agent team

- Commander: understand reports, delegate tasks, identify blockers and answer overall status.
- Procedure: retrieve the applicable fixture procedure and create sourced, owned tasks.
- Evidence: link witness reports, compare observations and flag relevant contradictions.
- Communications: select configured recipients, send messages and track acknowledgements.
- Records: reconcile stored evidence and generate a sourced handoff report.

Each agent receives only the tools required for its role. Server code validates every proposed
tool call before changing state. IDs, timers, persistence, access checks and retries remain
deterministic server behavior.

### Om's required handoffs to Ritesh

1. Shared TypeScript types and fixture snapshots.
2. Backend base URL and local startup instructions.
3. Snapshot and SSE endpoints returning the agreed schema.
4. Direct-agent question endpoint and response lifecycle.
5. Slack connection state and incident thread URL in every snapshot.
6. Development events for idle, working, waiting, blocked, failed and done agent states.

## Ritesh: UI and frontend

### Application shell

- Build the off-white desktop layout inspired by the supplied Agents Office reference.
- Add the SafeSlackForce header, selected incident, Slack connection state and Slack thread link.
- Reserve the main area for the 3D office and the right side for tasks and agent details.
- Keep tasks and incident status usable on narrow screens with the 3D view behind a toggle.

### 3D command center

- Put the Commander on the largest central platform.
- Add four surrounding platforms: Procedure, Evidence, Communications and Records.
- Create reusable desk and avatar components.
- Show idle, working, waiting, blocked, failed and done states using labels and visual cues.
- Animate a connection only when a real handoff event is received.
- Implement office overview, department selection, agent focus and camera reset.
- Keep cards, labels and controls from obscuring selectable agents.
- Use original geometry or properly licensed assets; do not copy the reference repository's art.

### Right-side inspector

- Overview: current incident, blockers, owners, pending human actions and recent events.
- Agent view: current task, source inputs, tool results, waiting reason and related agents.
- Task view: status, human owner, supporting sources and Open in Slack action.
- Direct-agent questions: composer with pending, answered and failed states.
- Report view: versions, outstanding actions and download control.

### Data integration

- Start with fixtures that conform exactly to the shared contract.
- Load the incident snapshot from Om's API.
- Subscribe to SSE updates after the snapshot cursor.
- Replace visible state from each complete snapshot instead of maintaining a second workflow.
- Deduplicate event IDs and reconnect from the last cursor.
- Display fixture, disconnected and reconnecting states clearly.
- Never place Slack, OpenRouter or server-session secrets in frontend environment variables.

### Ritesh's required handoffs to Om

1. Frontend development command and configured backend URL.
2. One working screen using the shared fixture snapshot.
3. List of any contract fields needed before changing frontend names locally.
4. Verified API adapter and SSE connection-state behavior.
5. Final asset attribution and license notes.

## Shared contract

The canonical contract lives in `packages/contracts`. Om maintains the runtime schema and
Ritesh imports the same exported types. Agree before changing agent IDs, task states, incident
states or payload fields.

Required agent IDs:

```text
commander
procedure
evidence
communications
records
```

Required agent states:

```text
idle | working | waiting | blocked | failed | done
```

Every incident snapshot includes:

- Incident ID, version, cursor, title, location and status.
- Slack connection state and thread URL.
- Agent states, current task, short summary and waiting reason.
- Tasks, owners, blockers, status and permitted Slack action URL.
- Recent activity with timestamps and source references.
- Available report versions and authorized download URLs.

Full field definitions and endpoint shapes are in
[`INCIDENTOS-SLACK-BUILD-PLAN.md`](INCIDENTOS-SLACK-BUILD-PLAN.md).

## Parallel work schedule

| Block | Om | Ritesh | Required checkpoint |
|---|---|---|---|
| 0-15 min | Confirm agent IDs, records and Slack channel | Confirm layout and fixture shape | Freeze initial contract |
| 15-45 min | Receive mention and reply in its Slack thread | Build shell, center platform and four pods | Slack round trip and fixture UI work |
| 45-90 min | Persist incident and expose snapshot/SSE | Build task inspector and API adapter | Slack report changes the UI |
| 90-135 min | Add agent tools and acknowledgement | Add focus camera and agent panel | Slack action updates state and scene |
| 135-165 min | Add contradiction review and report | Add handoffs, failures and report view | Complete demo rehearsal |
| Final 45 min | Correctness, README and repo checks | Visual cleanup and recording | Submit every required artifact |

Integrate at every checkpoint. If the first live Slack event is not visible in the browser by
the second checkpoint, both work on that connection before adding more features.

## Git ownership

| Path | Primary owner |
|---|---|
| `apps/api/` | Om |
| `apps/web/` | Ritesh |
| `packages/contracts/` | Shared; Om maintains canonical types |
| `fixtures/` | Om owns content; both use it |
| `docs/` | Each owner updates their setup and behavior |
| Root configuration and lockfile | Om coordinates changes |

Use separate backend and frontend branches with small commits. Communicate shared dependency,
contract and root configuration changes before editing them. Avoid resolving a mismatch by
rewriting files in the other person's owned path.

## Integration definition of done

- A Slack mention creates exactly one persisted incident.
- The Commander and relevant specialist desks visibly activate from backend events.
- A second Slack user can acknowledge an assigned task.
- Sending a message and human acknowledgement remain separate states.
- A contradictory Slack reply puts only the affected work under review.
- Selecting an agent explains its blocker using source-linked incident state.
- Slack and the browser display the same owners, blockers and incident status after refresh.
- The designated Slack supervisor can accept the handoff.
- Records generates a downloadable report with unresolved work and source references.
- A backend or model failure appears as failed instead of playing a completion animation.

## Demo responsibilities

- Om drives the Slack incident report and explains the working agent/tool orchestration.
- Ritesh provides the witness or responder update and demonstrates the 3D inspection flow.
- One of them acts as the configured Slack supervisor and accepts the final handoff.
- Om verifies the report and technical claims before recording.
- Ritesh records the two-minute visual walkthrough after one uninterrupted rehearsal.

The final story is one continuous action: a real Slack report becomes coordinated agent work,
a human-acknowledged handoff and a source-backed report visible through the 3D command center.
