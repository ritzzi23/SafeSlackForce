import ArchitectureDiagram from "./ArchitectureDiagram";
import ExplainNav from "./ExplainNav";
import { AGENTS, FACTS } from "./facts";

type Decision = { id: string; tag: string; title: string; call: string; instead: string; why: string; where: string };
type Group = { mark: string; title: string; blurb: string; tone: string; decisions: Decision[] };

const LIFECYCLE = [
  ["Report", "A person mentions the bot in the incident channel. Intake checks the workspace and channel, drops bot messages and de-duplicates Slack retries."],
  ["Coordinate", "Autopilot alerts management and schedules the next status update. The Commander records the reported location and facts with their source message and delegates."],
  ["Assign", "Procedure turns the approved procedure into tasks owned by named people. Communications posts them in the thread with buttons."],
  ["Acknowledge", "A responder presses Acknowledge. If nobody does before the follow-up window, the backup owner is chased automatically."],
  ["Correct", "Anyone can join the thread by link or QR. New replies, edits, deletions and photos update the incident; Evidence saves a sourced review and flags only the affected task."],
  ["Hand off", "Records saves a sourced report with open work listed. A supervisor accepts the handoff in Slack; agents never close the incident."],
];

const GROUPS: Group[] = [
  { mark: "A", title: "Environment and architecture", tone: "info", blurb: "Where the agent lives, and the seams that keep it simple enough to finish in a day.", decisions: [
    { id: "D1", tag: "Environment", title: "The Slack thread is the system of record", call: "Every assignment, acknowledgement, correction and handoff happens as a message or button in the incident thread. The dashboard mirrors it.", instead: "A separate web chat where the agent reports to one user.", why: "Coordination means waiting on other people. Only the place where those people already are can assign a task, see it accepted and chase a backup.", where: "apps/api/src/slack.ts, intake.ts" },
    { id: "D2", tag: "Transport", title: "Socket Mode instead of a public webhook", call: "The API opens an outbound WebSocket to Slack, so no public URL, TLS termination or request-signing endpoint is needed.", instead: "Slack Events API over HTTP.", why: "A laptop behind venue Wi-Fi can run the real integration, and there is no inbound attack surface during the demo.", where: "apps/api/src/slack.ts" },
    { id: "D3", tag: "Runtime", title: "One long-running process with an event log", call: "State lives in SQLite: entities plus an append-only event log per incident. Every change bumps a version and emits an event.", instead: "Serverless functions and a hosted database.", why: "Socket Mode, the one-second notification pump and live streams all need a persistent process. The event log gives replay after a disconnect for free.", where: "apps/api/src/store.ts, domain.ts" },
    { id: "D4", tag: "Contract", title: "One zod schema shared by API and browser", call: "Snapshots, agent IDs, task states and stream events are defined once in packages/contracts and validated on both sides.", instead: "Hand-written TypeScript types that drift between two owners.", why: "Two people built the backend and frontend in parallel. A malformed snapshot is rejected on arrival instead of rendering a wrong state.", where: "packages/contracts/src/index.ts" },
  ]},
  { mark: "B", title: "Agents and tools", tone: "ai", blurb: "The model proposes; the server decides what actually changes.", decisions: [
    { id: "D5", tag: "Topology", title: `A Commander and four specialists, ${FACTS.tools} scoped tools`, call: "Each agent receives only its own tool list. Records cannot notify; Communications cannot record facts.", instead: "One agent holding every tool.", why: "Smaller tool lists make the model more reliable and turn a prompt mistake into a refused call rather than an unwanted Slack message.", where: "apps/api/src/agents.ts (allowed)" },
    { id: "D6", tag: "Authority", title: "The server owns IDs, timers, roles and retries", call: "Tool calls are validated before any state change. Task creation is idempotent, recipients must be on the roster, and timers are server code.", instead: "Letting the model choose recipients or decide when to follow up.", why: "The parts that must be exactly right are deterministic. The model does judgement, not bookkeeping.", where: "domain.ts, notifications.ts" },
    { id: "D7", tag: "Prompt safety", title: "Slack text is evidence, never instructions", call: "Messages, documents and tool output are labelled untrusted. Facts are recorded as reported, not confirmed, and must cite source IDs.", instead: "Feeding thread text in as if it came from the operator.", why: "Anyone in the channel can type. A message must not be able to expand an agent's permissions or mark something safe.", where: "agents.ts system prompt, record_fact" },
    { id: "D8", tag: "Evidence", title: "Evidence reviews are saved, not narrated", call: "The Evidence agent must persist a structured review: a reported location quoted exactly from an active message, observations with sources, or an explicit reason for no update.", instead: "Accepting a fluent paragraph as the evidence outcome.", why: "A saved, sourced review can be checked, contradicted and reused by Records. A narrative cannot.", where: "agents.ts save_evidence_review" },
    { id: "D9", tag: "Honesty", title: "A failed tool cannot become a successful agent", call: "If any tool fails, the agent's status is failed even when the model writes a confident answer.", instead: "Trusting the model's final message as the outcome.", why: "In an incident, a false 'done' is worse than a visible failure.", where: "agents.ts, workflow tests" },
  ]},
  { mark: "C", title: "Humans in the loop", tone: "warn", blurb: "Agents move the digital work. People own the physical world.", decisions: [
    { id: "D10", tag: "Autonomy", title: "Digital coordination runs without approval gates", call: "A new incident immediately alerts management in the thread and schedules the next status update from a persisted schedule. The Commander can reschedule it with manage_response.", instead: "Waiting for someone to accept ownership before anyone senior hears about it.", why: "The first minutes matter most. Alerts and reminders are safe to automate; confirming that something physically happened is not.", where: "apps/api/src/response.ts" },
    { id: "D11", tag: "Control", title: "Only a named person confirms a physical action", call: "Complete requires the task owner or a supervisor and a written note. Handoff and closure are supervisor actions in Slack.", instead: "An agent marking 'area secured' from a message that says so.", why: "The system cannot see the loading dock. Confirmation has to come from someone accountable.", where: "domain.ts confirm, close, handoff" },
    { id: "D12", tag: "Escalation", title: "Sent is not acknowledged", call: "Delivery and acknowledgement are separate states. With no acknowledgement after the follow-up window, the backup owner is notified once.", instead: "Treating a delivered message as accepted responsibility.", why: "The failure mode in real incidents is a message everyone saw and nobody owned.", where: "notifications.ts pump" },
    { id: "D13", tag: "Review", title: "Human input is reviewed before relay", call: "Voice updates, the emergency call record and copilot questions to agents show the text first and need an explicit confirmation before they reach Slack.", instead: "Posting speech-to-text or copilot output straight into Slack.", why: "Speech recognition mishears names and locations, and whatever reaches the thread is what responders act on.", where: "VoiceUpdate.tsx, EmergencyCall.tsx, IncidentCopilot.tsx" },
  ]},
  { mark: "D", title: "Failure handling", tone: "fail", blurb: "Designed for timeouts, restarts and double clicks, not just the happy path.", decisions: [
    { id: "D14", tag: "Delivery", title: "Uncertain, not resent", call: `A Slack send that times out is marked uncertain. A supervisor inspects the thread before retrying, capped at ${FACTS.deliveryAttempts} attempts.`, instead: "Automatic retry on timeout.", why: "Slack may have accepted the message. Auto-retry pages the same person twice in an emergency.", where: "notifications.ts" },
    { id: "D15", tag: "Concurrency", title: "Idempotency keys and version checks", call: "Every dashboard request carries a request ID and the incident version. Stale buttons and repeated submissions are rejected.", instead: "Last write wins.", why: "Two responders pressing buttons on an old card must not overwrite newer state.", where: "http.ts, domain.ts" },
    { id: "D16", tag: "Recovery", title: "Restarts never fake completion", call: "On startup, work that was in flight is marked failed or uncertain, and dashboard sessions persist so nobody has to re-pair.", instead: "Silently resuming or dropping interrupted work.", why: "After a crash the operator needs to know exactly what did not finish.", where: "apps/api/src/index.ts" },
    { id: "D17", tag: "Cost", title: "Spend is reserved before every call", call: "OpenRouter and Exa calls reserve budget first and are capped by count and dollars. Unknown costs keep their reservation. The copilot has its own cap.", instead: "Checking the bill afterwards.", why: "Agent loops can run away. The cap holds even if a provider does not report cost.", where: "budget.ts, copilot.ts" },
  ]},
  { mark: "E", title: "Surfaces and scope", tone: "neutral", blurb: "Extra ways in, and the lines we deliberately did not cross.", decisions: [
    { id: "D18", tag: "Emergency", title: "The 911 instruction is a fixed rule, not a model", call: "Words such as unconscious, trapped or fire trigger 'Call 911 now' on screen and out loud, before any model call. The autonomous emergency-call step is a labelled simulation on synthetic incidents; no call is placed.", instead: "Asking the model whether it sounds serious.", why: "It must work when the network or model is down, and it must never be talked out of it.", where: "EmergencyCall.tsx lifeThreat" },
    { id: "D19", tag: "Shared thread", title: "Join by link or QR, not a new app", call: "Join this incident shows the Slack thread link and a QR code so people on site add observations and photos from their phones in the same thread.", instead: "An anonymous web form for witnesses.", why: "Every update stays attached to one incident and inherits Slack's workspace and channel permissions. The QR never points at a localhost dashboard.", where: "IncidentShare.tsx" },
    { id: "D20", tag: "Copilot", title: "CopilotKit runs behind the same session", call: "The runtime is mounted inside the Express API at /api/copilotkit, uses the same OpenRouter model, and asks for approval before an agent question reaches Slack.", instead: "A hosted copilot backend with its own keys.", why: "One origin, one login, one spend policy, and no secret in the browser.", where: "copilot.ts, IncidentCopilot.tsx" },
    { id: "D21", tag: "Workspace", title: "Follow-through lands in Ambiguous Workspace, one way", call: "Records mirrors every human-owned task onto the team's Ambiguous task board, keeps its status in sync, and publishes each handoff report as an Ambiguous doc.", instead: "Leaving follow-up work buried in a Slack thread after the incident cools down, or a two-way sync.", why: "Incidents create work that outlives the thread. One-way mirroring means a board edit can never confirm a physical action; Slack stays the record.", where: "apps/api/src/workspace.ts" },
    { id: "D22", tag: "Scope", title: "Named cuts", call: "No real phone dispatch, one workspace and channel, a synthetic procedure and roster. The dashboard deploys to Vercel; the API stays persistent.", instead: "Telephony, multi-tenant plumbing and real medical data in a one-day build.", why: "A narrow flow that works end to end beats a broad one that is mocked.", where: "vercel.json, docs/DEPLOY-VERCEL.md" },
  ]},
];

export default function SystemDesign() {
  const total = GROUPS.reduce((n, g) => n + g.decisions.length, 0);
  return (
    <div className="explain-page">
      <ExplainNav current="design" />
      <main className="explain-main">
        <header className="explain-heading">
          <div>
            <p className="explain-eyebrow">System design</p>
            <h1>Agents coordinate. People confirm.</h1>
            <p>How SafeSlackForce turns a Slack thread into an incident response room, and every load-bearing choice behind it: what it replaced, why it won, and where it lives in the code.</p>
          </div>
          <span className="explain-pill"><b>{total} decisions</b> · {FACTS.backendTests + FACTS.frontendTests} tests</span>
        </header>

        <section className="explain-panel" aria-labelledby="hl-title">
          <p className="explain-eyebrow">High-level architecture</p>
          <h2 id="hl-title">One thread, one process, five agents</h2>
          <ArchitectureDiagram />
        </section>

        <section className="explain-panel" aria-labelledby="life-title">
          <p className="explain-eyebrow">Incident lifecycle</p>
          <h2 id="life-title">From an @mention to an accepted handoff</h2>
          <ol className="lifecycle">
            {LIFECYCLE.map(([name, text], i) => <li key={name}><span>{String(i + 1).padStart(2, "0")}</span><h3>{name}</h3><p>{text}</p></li>)}
          </ol>
        </section>

        <section className="explain-panel" aria-labelledby="agents-title">
          <p className="explain-eyebrow">Agent team</p>
          <h2 id="agents-title">Each agent gets only the tools its job needs</h2>
          <div className="agent-table-wrap">
            <table className="agent-table">
              <thead><tr><th>Agent</th><th>Job</th><th>Tools</th></tr></thead>
              <tbody>{AGENTS.map(a => <tr key={a.id}><td><b>{a.name}</b></td><td>{a.job}</td><td>{a.tools.map(t => <code key={t}>{t}</code>)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        {GROUPS.map(g => (
          <section className="decision-group" key={g.mark} aria-labelledby={`group-${g.mark}`}>
            <div className="decision-group-head"><span className={`decision-mark tone-${g.tone}`}>{g.mark}</span><div><h2 id={`group-${g.mark}`}>{g.title}</h2><p>{g.blurb}</p></div></div>
            <div className="decision-grid">
              {g.decisions.map(d => (
                <article className="decision-card" key={d.id}>
                  <div className="decision-top"><span className="decision-id">{d.id}</span><span className={`decision-tag tone-${g.tone}`}>{d.tag}</span></div>
                  <h3>{d.title}</h3>
                  <p className="decision-call">{d.call}</p>
                  <dl>
                    <div><dt>Instead of</dt><dd>{d.instead}</dd></div>
                    <div><dt>Why</dt><dd>{d.why}</dd></div>
                    <div><dt>In code</dt><dd><code>{d.where}</code></dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
