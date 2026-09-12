# SafeSlackForce frontend — Ritesh’s workspace

A working React / Three.js frontend with an original cutaway warehouse command office, central Commander, four specialist desks, agent inspection and conversation, tasks, evidence sources, timeline, and handoff report access.

This package is now part of the root npm workspace on `main`. Om owns the root workspace configuration, backend and lockfile; Ritesh owns the UI. Install once from the root with `npm ci` using Node 22+.

## Run the demo

From the repository root:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. This starts both servers. The standalone UI preview needs no API key; use `npm run dev:web` for only the frontend. Fonts ship with the frontend. Pair through settings to use persisted backend state; offline mode offers **Create offline rehearsal**.

The office initially shows the team mobilizing. Select an agent, type a question, inspect task owners and sources, drag to orbit, or use zoom/reset. **Play demo** advances through five synthetic stages at 5.2 seconds per stage. Each stage can also be selected directly. At the handoff stage, the download button produces a clearly labeled synthetic Markdown report.

Demo data and replies are scripted and visibly labeled. They do not represent live agent execution, Slack delivery, or human approvals. The scene’s working animation comes from the snapshot’s agent status; a handoff effect requires a demo or backend handoff event.

## Connect to Om’s backend

1. Run Om’s backend on port 4100 as described in the root README.
2. Set its `FRONTEND_ORIGIN=http://127.0.0.1:5173` to match this frontend URL. Alternatively, open the frontend at `http://localhost:5173` and retain the backend’s localhost origin.
3. Report an incident through Slack (or create one with Om’s fixture API when testing).
4. Click **Connect Slack** or the settings icon. Enter `DASHBOARD_TOKEN` once in the pairing dialog. It is exchanged for the backend’s HTTP-only cookie and is never stored in browser storage or compiled into assets.
5. The frontend loads the incident list and canonical snapshot, then subscribes to the named `snapshot.updated` SSE event with credentials. Questions are posted with their request ID and expected incident version; the response is polled from `/api/requests/:requestId`.

The dev server proxies `/api` and `/health` to `BACKEND_URL` in the repository-root `.env` (or shell environment), defaulting to `http://127.0.0.1:4100`. This setting stays in the Vite server and is not bundled into the browser. Restart the frontend after changing it. Source URLs and report downloads come from the backend. Human task approvals and physical confirmations remain in Slack. Backend fixture mode retains a **BACKEND FIXTURE** label and never fabricates links to live Slack threads.

### Use one shared backend on Om's machine

Only one backend should consume this Slack app's events with the current local SQLite design. Slack distributes events among connected Socket Mode clients; it does not replicate incidents between your databases.

1. Om shares the API's reachable origin, not his `localhost` URL. On a trusted shared LAN he can bind the API with `HOST=0.0.0.0` and share his machine's LAN IP and port 4100; otherwise use an existing HTTPS deployment or private network connection. Venue Wi-Fi may block connections between laptops. Keep any publicly reachable endpoint behind HTTPS and the existing dashboard authentication.
2. Om sets `FRONTEND_ORIGIN=http://localhost:5173` for your browser's exact origin, retains live mode and his database, and runs `npm run start:api`. The API must be reachable from your laptop.
3. On your laptop, verify `curl --fail https://OM_API_HOST/health` (replace the example origin). Expect `mode: live` and `slack: connected`. This proves reachability; pairing and the incident list verify it is the server holding the desired incident.
4. Stop your local API. Set `BACKEND_URL=https://OM_API_HOST` in your root `.env`, then run **only** `npm run dev:web`. Do not run `npm run dev`, which also starts another Slack consumer.
5. Open `http://localhost:5173`, pair using Om's backend's dashboard token shared privately, and refresh incidents. The existing incident should appear if this is the backend that processed it. Your local provider keys are not needed for this frontend-only setup.

Changing the proxy does not transfer a database. If Om's server has the existing incident, keep using that server for the rehearsal. The `DASHBOARD_URL` used in Slack links is the frontend address participants open, not the API proxy target.

A stale question gets an explicit error and refreshes the snapshot for human reconsideration. Duplicate/out-of-order stream updates are ignored. Invalid events are surfaced. EventSource reconnects automatically and the backend replays its persisted history; stale versions cannot replace current state. Switching incidents closes the previous stream.

For deployment, serve the static `dist/` folder behind the same origin as `/api` or configure an equivalent reverse proxy. Vite’s development proxy is not part of the production bundle. A static frontend alone does not host the agent runtime.

## Verification

```sh
npm test
npm run build
```

Tests cover shared-contract fixture validation, unresolved work after handoff, versioned question requests, stale-version errors, malformed snapshots, SSE replay/deduplication and handoff validation, and source URL safety.

The layout prioritizes chat/tasks on phones, with a **View office** toggle. Agent selection and stage navigation use labeled keyboard-focusable buttons. Reduced motion is respected. A scene failure leaves the incident panels usable.

## Main files

- `src/OfficeScene.tsx`: desks, working agents with safety gear/headsets, selection labels, camera, and event handoffs.
- `src/Room.tsx`: continuous wood/concrete floors, walls/windows, loading bay, forklift, shelving, and office furniture.
- `src/SlackThread.tsx`: labeled synthetic Slack thread or validated backend source messages.
- `src/App.tsx`: workspace shell, Commander/specialist conversations, tasks, activity, pairing, demo playback.
- `src/api.ts`: session pairing, snapshot validation, SSE and question API adapter.
- `src/data.ts`: explicit synthetic demo states, using `@safeslackforce/contracts`.
- `src/styles.css`: responsive visual styling.

## Design and assets

Composition inspired by [Hermes3D’s cutaway office](https://github.com/iamlukethedev/Hermes3D/blob/main/assets/branding/hermes3d-hero.png) and [Agents Office’s reference image](https://github.com/ajsahni/agents-office/blob/main/assets/readme-hero.jpg). No source code, models, or artwork from that repository is copied or bundled. All scene geometry is created in this frontend. Icons are Lucide (ISC); DM Sans and Manrope are bundled through Fontsource (SIL Open Font License). Dependency license files remain in their packages.

## Two-minute walkthrough

- 0:00–0:20: Introduce the incident and the central Commander.
- 0:20–0:45: Play or step through mobilization and acknowledgement waiting; select the departments.
- 0:45–1:15: Choose **Conflicting evidence**, select Evidence, and ask why the task is blocked. Open Tasks to show ownership and source references.
- 1:15–1:40: Show the timeline, then the supervisor-accepted handoff stage.
- 1:40–2:00: Download the report and explain that open tasks remain assigned.

Use the real backend and actual Slack actions for the final hackathon recording. If showing this standalone demo, keep its simulation label visible and identify its scripted responses.

## Warehouse scene update

The default expanded room view gives more space to the office. The first camera control restores the full workspace overview. Five visible workers correspond to the five real agent IDs; empty meeting chairs and furniture do not imply extra agents. Floor planks use one instanced mesh. Screens/signage are drawn locally, so the scene does not fetch external models or textures.

The **Slack** tab shows a clearly labeled scripted conversation in standalone demo mode. When paired, it reads `GET /api/incidents/:id/details` for source messages and protected attachments. This endpoint does not return all bot replies, so the panel explicitly describes its scope. Reviewed voice/text updates use the backend transcript relay; confirmations and approvals remain human actions in Slack. Browser microphone support is optional, with typed fallback and explicit review before submission. Commander chat uses the question endpoint. Backend fixture messages are labelled synthetic and never sent to Slack.
