# SafeSlackForce: Slack Workflow and Om / Ritesh Build Split

12 September 2026. Current implementation plan for the hackathon build.
This is a development specification, not a claim that the integrations are implemented.

## 1. Decisions to build against

- Slack is the main channel for reports, witness updates, notifications and human approvals.
- The Commander is the central agent and the main conversational contact in Slack.
- The frontend is a live 3D agent workspace inspired by the supplied Agents Office image.
- The Commander occupies the central platform; four specialist departments surround it.
- Om builds all backend logic, agents, tools, Slack integration, data and live events.
- Ritesh builds the complete browser UI, 3D scene, interactions and frontend API integration.
- Both build against the shared contract in this plan and integrate before visual polish.

Problem: after an incident report, someone must establish ownership, chase acknowledgements
and reconcile conflicting updates. SafeSlackForce performs that coordination and leaves evidence
of what was done and what remains outstanding.

## 2. The workflow from Slack to the office

Use one pre-created Slack demo channel, for example #safeslackforce-demo. Invite the app and both
builders' Slack users. Each incident starts with a root message; its thread holds that incident's
updates. Dedicated channels per incident can be added later.

```text
Report and replies in Slack
           |
      Commander
           |
   +-------+----------+---------------+
   |                  |               |
Procedure          Evidence     Communications
   |                  |               |
   +-------- persisted findings ------+
                      |
                   Records
                      |
          Commander summary in Slack

All agent/task events also update Ritesh's 3D office.
```

Example root message:

> @SafeSlackForce Forklift incident at Loading Dock B. One person is reported injured.

The bot replies in the root message's thread with an incident card and dashboard link.
The Commander delegates procedure lookup and contact coordination. A witness replies in
the same thread. Staff acknowledge tasks using Slack buttons. New findings update both
the Slack summary and the 3D view.

Five agent roles run behind one Slack bot. Identify specialist findings in message text;
separate Slack apps or impersonated human accounts are unnecessary.

## 3. Frontend direction for Ritesh

Reference inspected:
[Agents Office hero image](https://github.com/ajsahni/agents-office/blob/main/assets/readme-hero.jpg).

The image has an off-white canvas, floating isometric department platforms, desks and avatars,
connecting walkways, compact department cards and a persistent activity panel on the right.
Adapt that composition with original geometry and styling. The center in SafeSlackForce contains
the Commander agent and incident board, replacing the reference's central knowledge hub.

### Spatial composition

```text
                 PROCEDURE             EVIDENCE
                [desk + agent]       [desk + agent]
                       \               /
                        \             /
                          COMMANDER
                        [central desk]
                       [incident board]
                        /             \
                       /               \
              COMMUNICATIONS           RECORDS
              [desk + agent]         [desk + agent]
```

Keep the central platform largest and visually dominant. Each outer department has one working
agent initially. Empty decorative workers should not imply additional running agents.
Walkway geometry can be static. Animate a connection only when a real handoff event occurs.

### Screen composition

- Header: SafeSlackForce, selected incident, Slack connection state and Open Slack Thread link.
- Main canvas: roughly 70% of desktop width, with the Commander centered in the available area.
- Right panel: roughly 30%, with a practical minimum width for readable tasks and agent chat.
- Lower canvas controls: zoom in, zoom out and reset camera.
- Narrow screens: task/agent panels take priority; a toggle reveals the 3D view.

Use warm white, light stone platforms, soft shadows and restrained color accents. Proposed
department colors: Commander indigo, Procedure teal, Evidence blue, Communications amber,
Records violet. Status labels and icons distinguish blocked/failed tasks from department colors.
Place cards and labels so they do not obscure selectable agents or the central platform.

### What appears on each department card

Department name, current task, actual runtime status and counts of active/waiting/done tasks.
Show "Waiting for Ritesh's acknowledgement" instead of a generic spinner. Use known counts,
not invented percentages or copied sales metrics from the reference.

### Selection and direct agent interaction

Overview: right panel shows blockers, task owners, human actions and recent events.
Select a department or avatar: camera focuses on that desk and right panel opens its details.
The Commander remains easy to return to through Reset View or its central platform.

Agent panel sections: current work, source references, tool results, blockers, concise answer
and a question composer. Questions such as "Why is this waiting?" address the selected agent
through Om's backend. Store the question and reply in shared incident history and mirror their
operational content into Slack, labelled as dashboard-originated.

Author identity comes from the backend session. The bot may relay the question but must not
pretend it was authored as the human's Slack account. For the local demo, Om provides a paired
coordinator session with a clear demo label. The UI cannot submit its own supervisor identity.

Keep approval and physical-completion actions in Slack for the MVP. The dashboard can show
"Respond in Slack" links. No duplicate editable chat channel or independent approval state.

### Suggested components

```text
AppShell / IncidentHeader / ConnectionBadge
OfficeScene / CommanderPlatform / DepartmentPod / AgentAvatar
DepartmentCard / HandoffEffect / CameraController
InspectorPanel / AgentQuestionComposer / TaskList / Timeline / ReportPanel
useIncidentSnapshot / useIncidentEvents / apiClient
```

React, TypeScript, Vite, React Three Fiber, Drei and CSS/Tailwind are sufficient. Use primitive
geometry initially; licensed GLB assets or Blender exports can replace it later. Do not copy
the reference project's source or assets without checking their applicable licenses.

## 4. Om: backend and agent responsibilities

| Workstream | Om's deliverable | Ritesh consumes |
|---|---|---|
| Slack | Working app, event ingestion, replies and buttons | Slack status and thread link |
| Incident state | SQLite records, lifecycle and versioned snapshots | Incident, tasks, facts and timeline |
| Agent runtime | Commander plus four specialists, tool execution | Agent states, runs and results |
| Procedure | Fixture document retrieval and owned tasks | Procedure references and tasks |
| Evidence | Sourced observations and contradiction detection | Evidence cards and review blockers |
| Communications | Actual Slack sends, acknowledgements, follow-up | Delivery and acknowledgement records |
| Records | Versioned Markdown report | Report metadata and download endpoint |
| Backend access | Session checks, Slack user-role mapping | Authorized browser session |
| Live transport | Snapshot endpoint, event stream and reconnect | Typed snapshot updates |
| Demo setup | Fixture people, procedure, timers and repeatable reset | Consistent demo incident |

### Agent tools and outputs

- Commander: read incident, propose sourced facts, delegate work, request clarification.
- Procedure: read configured procedure/roster, create owned tasks, request review.
- Evidence: link witness messages, compare observations, create sourced contradiction findings.
- Communications: dispatch permitted messages, record delivery, link human acknowledgement.
- Records: read event history, reconcile claims, save a sourced report version.

Store writes and events atomically where practical. The backend checks tool arguments, roles,
recipient scope and incident version. Timers, IDs, persistence and retries are server functions.
An agent's "done" state concerns its assigned digital work, not the physical incident.

## 5. Slack setup and implementation: Om

Use Bolt for JavaScript with Socket Mode on one local, long-running backend process. Socket
Mode receives Slack events over a WebSocket and avoids a public event-receiver URL. Workspace
app installation and granted scopes are still necessary.
[Official Socket Mode guide](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/).

### Initial configuration

1. Create the app in the test workspace and enable Socket Mode and interactivity.
2. Generate an app-level token with connections:write.
3. Grant bot scopes app_mentions:read, chat:write and channels:history for the public demo channel.
4. Subscribe to app_mention and message.channels so ordinary replies in tracked threads arrive.
5. Install/reinstall for the granted scopes, then invite the bot into the demo channel.
6. Configure channel ID, allowed workspace ID, responder IDs and supervisor IDs on the server.
7. Verify a mention -> bot reply -> human button acknowledgement before integrating the agents.

message.channels requires channels:history. If the test channel is private, configure the
corresponding private-channel events and scopes before relying on its replies.
[Message event documentation](https://docs.slack.dev/reference/events/message.channels/).

Server-only environment variables:

```text
SLACK_APP_TOKEN
SLACK_BOT_TOKEN
SLACK_TEAM_ID
SLACK_DEMO_CHANNEL_ID
SLACK_SUPERVISOR_USER_IDS
OPENROUTER_API_KEY
INCIDENTOS_MODEL
INCIDENTOS_SESSION_SECRET
```

### Routing, replies and buttons

Map (team_id, channel_id, root_message_ts) to one incident. Keep Slack timestamps as strings.
New mentions create incidents only in the configured channel; follow-up replies go to the
mapped incident. Filter out bot messages and unrelated channel messages. Deduplicate overlap
between app_mention and message events using workspace, channel and message timestamp, and
deduplicate event retries using event_id where present.

Post responses using thread_ts and update one bot-authored summary card rather than flooding
the thread. Persist returned message IDs. Surface delivery errors and uncertain outcomes.
[Posting messages and threads](https://docs.slack.dev/reference/methods/chat.postMessage/).

Buttons: Acknowledge task, Confirm my action, Request review, Accept handoff. Task ID and version
identify the pending action; the backend validates the Slack actor against the required role.
Slack interaction acknowledgement must be immediate, within Slack's three-second requirement;
queue model work after it. This transport acknowledgement is distinct from a human accepting
an incident task. [Bolt acknowledgement guide](https://docs.slack.dev/tools/bolt-js/concepts/acknowledge/).

Handle edits as corrections and deletions as removed source evidence. Flag affected findings
for review; never silently keep using stale evidence. Persist pending follow-up timers and
suppress reminders after the relevant task is acknowledged.

### Voice, files and QR under the Slack decision

Initial reporting uses Slack text, including text entered through device dictation. This is
dictated reporting, not an SafeSlackForce audio-transcription feature. A browser voice composer can
be added later: display the transcript, confirm it, then send through the authorized backend
into the same Slack thread. No parallel browser conversation is created.

Witness text is sufficient for the Evidence agent's first contradiction check. Slack photo
download/analysis is an enhancement after the text workflow works; add files:read and verify
file access, permitted download URLs and vision support before promising it.

A QR code may point to the Slack incident permalink. It does not bypass workspace membership
or channel permissions. Pre-add demo participants. Anonymous witness access from the older
plan is deferred because Slack is now the primary channel.

## 6. Shared frontend/backend contract

Om owns runtime data and contract validation; Ritesh owns display state and scene geometry.
Freeze these IDs and field names before building. Revisions require a message between builders
and a matching fixture update. No independent renaming on either side.

```typescript
type AgentId = 'commander' | 'procedure' | 'evidence' | 'communications' | 'records';
type AgentStatus = 'idle' | 'working' | 'waiting' | 'blocked' | 'failed' | 'done';
type TaskStatus = 'proposed' | 'assigned' | 'acknowledged' | 'in_progress'
  | 'completed' | 'blocked' | 'needs_review' | 'failed' | 'cancelled';
type IncidentStatus = 'reported' | 'coordinating' | 'handoff_ready'
  | 'handed_over' | 'closed';

type SourceRef = {
  id: string;
  label: string;
  kind: 'slack_message' | 'procedure' | 'tool_result' | 'human_confirmation';
  url?: string; // Only links the current viewer is permitted to receive.
};
type AgentView = {
  id: AgentId;
  name: string;
  status: AgentStatus;
  currentTaskId: string | null;
  summary: string;
  waitingOn: string | null;
  sources: SourceRef[];
};
type TaskView = {
  id: string;
  title: string;
  agentId: AgentId;
  owner: { slackUserId: string; name: string } | null;
  status: TaskStatus;
  version: number;
  blockedReason: string | null;
  sources: SourceRef[];
  slackActionUrl: string | null;
};
type IncidentSnapshot = {
  schemaVersion: 1;
  incidentId: string;
  version: number;
  cursor: number;
  mode: 'live' | 'fixture';
  title: string;
  location: string;
  status: IncidentStatus;
  slackThreadUrl: string;
  slackConnection: 'connected' | 'reconnecting' | 'disconnected';
  agents: AgentView[];
  tasks: TaskView[];
  activity: { id: string; text: string; timestamp: string; sources: SourceRef[] }[];
  reports: { id: string; version: number; title: string; downloadUrl: string }[];
};
type StreamUpdate = {
  eventId: string;
  cursor: number;
  kind: 'snapshot.updated';
  handoff?: { from: AgentId; to: AgentId; taskId: string };
  snapshot: IncidentSnapshot;
};
```

Use complete snapshots in each update for this small demo. This simplifies frontend integration
and prevents separate reducers from disagreeing about agent and task state. Cursor orders event
updates; version detects stale incident mutations. Redact snapshots for the viewer on the server.

### Endpoints

| Endpoint | Behavior |
|---|---|
| GET /api/incidents | Authorized incident IDs, titles and current statuses |
| GET /api/incidents/:id | IncidentSnapshot with cursor |
| GET /api/incidents/:id/events?after=N | SSE updates after cursor N |
| POST /api/incidents/:id/agents/:agentId/questions | Accept a direct agent question |
| GET /api/requests/:requestId | Pending, done or failed question and answer |
| GET /api/incidents/:id/reports/:reportId | Authorized Markdown download |

Question body: { requestId, text, expectedVersion }. Actor comes from session, not the body.
Return 202 with requestId after storing the request. Persist the answer with sources, reflect
it in snapshot activity and mirror it into Slack. Ritesh can poll request status while showing
the agent working. Return 409 for a stale request, 401/403 for access issues, and an explicit
failed status if model work fails. Retry uses the same requestId to avoid duplicate questions.

Ritesh loads a snapshot, then opens SSE after its cursor. Om must replay persisted events in
between those requests. On reconnect, deduplicate eventId/cursor; if replay is unavailable,
send a fresh snapshot and reset the cursor. Fixture mode has a visible label and separate adapter.

## 7. Ritesh: frontend checklist

1. Build the off-white app shell, header, right inspector and responsive layout.
2. Build the central Commander platform and four surrounding department pods.
3. Create one reusable avatar/desk component with distinct department colors.
4. Implement overview, desk selection, camera focus and reset controls.
5. Render tasks, real statuses, owners, blockers and source links in the inspector.
6. Add question composer with pending, answered and failed states.
7. Implement snapshot loading, SSE connection state, refresh and reconnect behavior.
8. Add real-event handoff animation and status transitions.
9. Add report download and Open Slack Thread actions.
10. Check text readability, overlapping cards, keyboard selection and reduced-motion behavior.

Use the shared fixture states idle, coordinating, waiting, contradiction, failed and handed_over.
Fixture records must conform to the same contract. Let the fixture adapter be replaced by the
API adapter without changing scene components. Ritesh never needs model or Slack tokens.

## 8. Parallel milestones and handoff points

Times are planning blocks from the next build start, not claims about remaining event time.
If fewer than four hours remain, compress optional work and retain submission time.

| Block | Om | Ritesh | Integration checkpoint |
|---|---|---|---|
| First 15 min | Confirm IDs, model config and Slack setup | Confirm composition and shared fixture | Agree schema and ownership |
| Next 30 min | Receive mention and reply in same Slack thread | App shell, central platform, four pods | Slack round trip works |
| Next 45 min | SQLite snapshot, first agent/tool execution, SSE | Task inspector, statuses, API adapter | Slack report changes actual UI |
| Next 45 min | Specialist tools, notifications, acknowledgement | Focus camera, direct agent panel | One button updates Slack and UI |
| Next 30 min | Contradiction review, follow-up, sourced report | Handoffs, failures, report access | Full demonstration works |
| Final 45 min | Fix correctness, README and repository | Visual cleanup and recording | Submit required artifacts |

Integrate at each checkpoint. If there is no live Slack-to-UI update by the second checkpoint,
pause additional visual features and wire that path together.

## 9. Repository and ownership

```text
apps/api/             Om: Slack, agents, tools, state, sessions, SSE
apps/web/             Ritesh: scene, UI components, hooks, browser client
packages/contracts/   Shared agreement; Om maintains schema and canonical types
fixtures/             Om owns incident content; both use the same validated snapshots
docs/                 Split setup notes and demo instructions by responsibility
```

Om owns the root workspace config and shared lockfile changes. Ritesh owns the web package's
dependency requests and communicates them before root integration. Use backend and frontend
branches with small commits; do not rewrite one another's folders to resolve a contract mismatch.
Both may run their own implementation assistants; no agent delegation is performed by this plan.

One backend process owns Slack Socket Mode, model calls, SQLite and SSE. Ritesh can reach it
through a configured backend URL during integration. Configure the dev proxy/session cookie
path deliberately; do not put an administrative secret into a VITE_ variable. A shared browser
deployment needs a reachable backend; hosting only the frontend does not host the agent runtime.

## 10. Final demonstration

1. Om reports the synthetic Dock B incident in Slack.
2. Commander activates in the central platform and delegates to visible departments.
3. Procedure tasks and a real Slack notification appear with owners and source references.
4. Ritesh supplies a witness update in Slack and acknowledges an assigned task.
5. A contradictory follow-up places one task under review.
6. Select Evidence or Procedure in the office and ask why that task is blocked.
7. The agent cites the relevant Slack updates; the operational answer appears in the thread.
8. The designated Slack supervisor clarifies the task and accepts the handoff.
9. Records generates the sourced report, accessible from Slack and the browser.

Keep a missed-acknowledgement follow-up as a second test or include it if the two-minute
recording allows. Show a labelled accelerated timer, never implied real response timing.

## 11. Shared acceptance checks

- One Slack root message maps to one incident even when events repeat.
- Human replies in the tracked thread arrive without requiring repeated mentions.
- Bot messages do not recursively create incidents or agent runs.
- Button transport acknowledgement is prompt; human task acknowledgement is stored separately.
- Only configured Slack actors can confirm restricted tasks or accept handoff.
- Agent/task states on the scene match the persisted snapshot and recover after refresh.
- A dashboard question reaches the selected agent and shares the same incident state.
- Source corrections trigger review; "medic en route" does not confirm an emergency call.
- A failed tool produces a visible failure, not a completed animation.
- Only implemented connectors appear connected in the header.
- Slack remains usable when the 3D frontend is unavailable.
- API/model tokens never reach the frontend, fixture snapshots or repository.

## 12. Shareable assignment

Om: build the working Slack bot, Commander and four specialists, tool actions, persistent
incident/task state, confirmations, API/event stream and report generation. Supply the contract,
fixture snapshots and local setup instructions early.

Ritesh: build the complete Agents Office-inspired frontend with Commander at the center,
four surrounding departments, camera navigation, live status cards, agent inspector/chat,
timeline, report access and backend integration. Work from fixtures immediately, then replace
the fixture transport with the real backend at the first integration checkpoint.

Both: deliver one real Slack report through agent coordination to a human-accepted handoff,
visible in the 3D office and supported by a sourced report.

