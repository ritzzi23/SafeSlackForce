# SafeSlackForce — two-minute demo

The supplied event handbook requires a **two-minute demonstration video**. Aim for 1:50–1:55 to leave room for a title and finish. Confirm the submission deadline in your own portal; do not infer it from an old planning document.

## Before recording — not part of the two minutes

1. Both teammates pull `main`. Keep only the intended backend consuming this Slack app's events. Ritesh's `E2E-2026-09-12.md` reports a fresh incident reaching a different runtime; resolve/recheck this before recording. Do not kill unknown processes or remove the Slack app.
2. Start the chosen demo backend and matching frontend. If both ports are free, use Node 22 and `npm run dev` from the repository root. If the frontend already runs, start only the backend with `npm run dev:api`. Do not create a duplicate Slack consumer. The audit did not start the backend.
3. Open `http://localhost:5173`. Click the left-rail **Connect backend** settings button, enter the private dashboard token off-camera, and click **Pair workspace**. Verify both event-stream and Slack connection indicators. Never show `.env`, pairing tokens or API credentials in the video.
4. Put Slack and the dashboard side by side, or in adjacent browser tabs. In Slack, open the configured demo channel and select the installed bot from `@` autocomplete. Its external Slack name may still be IncidentOS even though the product is SafeSlackForce.
5. Run one fresh synthetic report and confirm the **same incident ID** appears in Slack and this dashboard. Connected indicators alone do not prove this. If the ID is absent locally, resolve routing before filming.
6. Let agents finish, inspect **Inform management** for a real Slack receipt, verify the report download, and rehearse Ritesh's same-thread update. Model timing varies: the timings below are a recording plan, not a response-time guarantee. Do not burn repeated runs chasing perfect timing.
7. Current local configuration at audit: live mode; autonomous response enabled; emergency-call simulation enabled; office directory disabled; Ambiguous key configured. Configured is not live-verified. Do not spend the main take on the office directory or claim a successful Ambiguous mirror without checking its actual remote records.
8. Keep notifications from unrelated apps hidden. Record readable text, not the entire desktop at tiny scale. No slides or source-code walkthrough needed.

## Paste these messages

**Om: new top-level message**, after selecting the installed bot mention:

> SYNTHETIC DEMO: A forklift incident has been reported at Loading Dock B. One person is reported injured. Please coordinate the response and keep management updated. No real emergency services should be contacted.

**Ritesh: reply inside that exact Slack thread**, not a new channel message:

> SYNTHETIC UPDATE: The site medic is reported on the way. We have not confirmed an external emergency-service call. The loading-dock area status is still unconfirmed.

## Timed script and clicks

Read the spoken parts conversationally. Do not speak the click instructions. Roughly 210 spoken words leaves time to point and click.

| Time | What to click/show | What Om says |
| --- | --- | --- |
| 0:00–0:17 | Slack: select the bot mention, paste the initial report, send, then open its thread. | “When something happens at work, reporting it is easy. The hard part is making sure the right people hear about it and nothing gets lost. We built SafeSlackForce to handle that coordination inside Slack.” |
| 0:17–0:35 | Dashboard: select the matching incident from the incident selector. Point at the journey strip and working agents; click the central Commander desk if needed. | “I report the incident once. The Commander delegates the work, and this office shows what the agents are actually doing. The journey makes the progress visible, including anything that is waiting or has failed.” |
| 0:35–0:55 | In **Autopilot**, expand **Inform management** to show its receipt. Point at **Schedule incident follow-up**. If visible, expand **Emergency call dispatch** to show the simulation label. | “Here, management has been notified, and a follow-up is scheduled. These are recorded actions, not just suggestions in a chat response. This emergency-call card is explicitly a simulation: no real emergency service is contacted.” |
| 0:55–1:10 | Click **Join this incident**. Show the QR/thread link briefly, then close the dialog with X. Ritesh opens the same thread and sends the update above. | “Ritesh can join the same incident through this link or QR code and add an update. He doesn't need to repeat the whole story to each agent.” |
| 1:10–1:32 | Dashboard: click **Slack** tab to show the new source message; then **Activity** to show recorded work. If task notifications exist, the left-rail bell opens **Notifications & responses**. Management delivery is in Autopilot, not necessarily this task-notification inbox. | “That update becomes part of the shared record. Notice the distinction: a medic being on the way does not mean an ambulance was called. The system keeps that uncertainty visible instead of inventing a completed action.” |
| 1:32–1:52 | When a report is saved, click the bottom-right downward-arrow button, **Download handoff report**. Show its outstanding tasks and source/timeline sections in a prepared Markdown-capable viewer. If the browser downloads without opening it, use the downloads menu to open the newest file. | “Finally, Records prepares the handoff, with the actions taken and the work still outstanding. People confirm what happened physically; agents do the coordination around it. One report, one shared thread, and a record the next person can actually use.” |
| 1:52–2:00 | Return to the dashboard; show the product name. Stop recording. | No extra narration needed. |

## If something differs during rehearsal

- **No report yet:** wait before filming that segment. For recovery, use the existing **Prepare handoff report** Slack control or ask Records in the dashboard. If you manually request it on camera, say “I'll ask Records to prepare the handoff,” not “it happened automatically.”
- **Report is an earlier revision:** label it as the previous report. Do not claim it contains the just-sent update until the new revision exists.
- **Management is scheduled, failed or uncertain rather than delivered:** use that exact status aloud. Never narrate success over a failure label.
- **Task notification inbox is empty:** show the management receipt under Autopilot instead. Different action records have different panels.
- **Generation takes longer:** record the genuine sequence and trim waiting time with a visible “waiting time shortened” caption. Do not splice different incident IDs into one supposedly continuous run.
- **No new live run works:** a saved incident can be shown only as “a recorded run.” Do not present fixture playback or historical receipts as newly executed actions.
- **Autonomous mode:** ownership/handoff approval controls may be hidden. This script deliberately does not rely on those older buttons or pretend the incident is closed.
- **Ambiguous bonus clip:** only if a real mirror is verified and you have time, replace the QR segment with “The tasks and report also appear in our team's workspace,” showing those exact matching records. Do not claim this merely because a key exists.

## Submission checklist

- Title: SafeSlackForce.
- Short description explaining the user/problem and Slack-native coordination.
- Public repository: https://github.com/ritzzi23/SafeSlackForce (verify public visibility).
- Two-minute video link accessible to judges.
- Social post tagging the exact event partners required by the portal.
- Credit reused libraries/templates and distinguish event-built functionality. Only claim sponsor integrations actually implemented and demonstrated.
- Submit before the deadline shown in the participant portal; the README or earlier notes are not the deadline authority.
