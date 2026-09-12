import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import ArchitectureDiagram from "./ArchitectureDiagram";
import ExplainNav from "./ExplainNav";
import { AGENTS, FACTS } from "./facts";

/**
 * The pitch as a page inside the product, not a PDF: the judge is already looking at the real
 * workspace, and every claim here is one click from the screen or file that backs it.
 * Arrow keys move, F toggles fullscreen, Home and End jump.
 */
type Slide = { label: string; kicker: string; title: ReactNode; body: ReactNode };

const Card = ({ title, children }: { title: string; children: ReactNode }) => <div className="slide-card"><h3>{title}</h3><p>{children}</p></div>;

const SLIDES: Slide[] = [
  { label: "Title", kicker: "AI Tinkerers · Agents, Everywhere · New York", title: <>Incidents already happen in Slack.<br /><span>Now the response team does too.</span></>, body: <>
    <p className="slide-hero-sub">SafeSlackForce is an AI incident response team inside Slack. A Commander and four specialist agents assign work to real people, chase anyone who does not answer, take hands-free emergency reports, and write the handoff, while a named human confirms every physical action.</p>
    <div className="slide-stats">
      <div><b>{FACTS.agents}</b><span>coordinating agents</span></div>
      <div><b>{FACTS.tools}</b><span>scoped tools</span></div>
      <div><b>{FACTS.backendTests + FACTS.frontendTests}</b><span>automated tests</span></div>
      <div><b>0</b><span>physical actions an agent can confirm</span></div>
    </div>
  </> },
  { label: "Problem", kicker: "01 · The problem", title: "The first ten minutes of an incident are a coordination failure", body: <>
    <p className="slide-lede">Someone posts "forklift tipped at Dock B, one person hurt". Everyone sees it. What happens next depends on who happens to be paying attention.</p>
    <div className="slide-cols">
      <Card title="Nobody owns it">Messages get reactions, not owners. The failure mode is a report everyone saw and no one accepted.</Card>
      <Card title="Facts drift">Location, injuries and whether help was called change across replies and edits. Contradictions go unnoticed.</Card>
      <Card title="The record is rebuilt later">The handoff report is written from memory after the fact, without sources, and open work gets lost.</Card>
    </div>
  </> },
  { label: "Solution", kicker: "02 · What it does", title: "Report in the thread. The team forms around it.", body: <>
    <ol className="slide-steps">
      <li><b>Report</b><span>@mention the bot in the incident channel</span></li>
      <li><b>Coordinate</b><span>Autopilot alerts management; Commander delegates</span></li>
      <li><b>Assign</b><span>Named owners get tasks with Slack buttons</span></li>
      <li><b>Escalate</b><span>No acknowledgement, the backup is chased</span></li>
      <li><b>Correct</b><span>Join by QR; contradictions flag only affected work</span></li>
      <li><b>Hand off</b><span>Sourced report; a supervisor accepts in Slack</span></li>
    </ol>
    <p className="slide-note">Live on screen: the 3D command center shows every agent's state as the thread changes.</p>
  </> },
  { label: "Why Slack", kicker: "03 · Why the environment matters", title: "This cannot be done from a chatbox", body: <>
    <p className="slide-lede">A chatbot can give advice to one person. Coordination needs other people, and those people are already in Slack.</p>
    <div className="slide-cols">
      <Card title="Assign to a colleague">Tasks go to real Slack users with Acknowledge, Request review and Confirm action buttons.</Card>
      <Card title="Wait, then escalate">Sent and acknowledged are different states. Silence triggers one follow-up to the backup owner.</Card>
      <Card title="One shared record">Who was assigned, who accepted and who confirmed is the thread history everyone already sees.</Card>
    </div>
  </> },
  { label: "Architecture", kicker: "04 · System design", title: "One thread, one process, five agents", body: <>
    <ArchitectureDiagram />
    <p className="slide-note">Socket Mode needs no public webhook · every change is versioned and logged · the dashboard streams events and resumes after a disconnect. Full register: 22 design decisions on the System design page.</p>
  </> },
  { label: "Agents", kicker: "05 · The agent team", title: "The model proposes. The server decides.", body: <>
    <div className="slide-agents">
      {AGENTS.map(a => <div key={a.id} className="slide-agent"><h3>{a.name}</h3><p>{a.job}</p><div>{a.tools.map(t => <code key={t}>{t}</code>)}</div></div>)}
    </div>
    <p className="slide-note">IDs, timers, roster checks and retries are server code. Slack text is treated as evidence, never as instructions.</p>
  </> },
  { label: "Control", kicker: "06 · Humans in control", title: "Agents move digital work. People own the physical world.", body: <>
    <div className="slide-cols">
      <Card title="Only people confirm">Completing a physical task needs the owner or a supervisor and a written note. Agents cannot close an incident.</Card>
      <Card title="Autonomous where it is safe">Management alerts, scheduled updates, evidence reviews and reports run on their own. Spoken reports and copilot questions are reviewed before they reach Slack.</Card>
      <Card title="Everything is sourced">Facts are recorded as reported, with the Slack message they came from. Reports cite their sources.</Card>
    </div>
  </> },
  { label: "Surfaces", kicker: "07 · More ways in", title: "More ways in, same guardrails", body: <>
    <div className="slide-cols two">
      <Card title="Autopilot and shared thread">Management is alerted the moment an incident is reported, the next update is scheduled, and every action and receipt shows on the Autopilot board. Anyone on site joins the same Slack thread by QR code.</Card>
      <Card title="Emergency call agent">Hands-free for the person on site: {FACTS.callQuestions} spoken triage questions. Words like "unconscious" or "trapped" trigger "Call 911 now" from a fixed rule that works even if the model is down.</Card>
      <Card title="CopilotKit incident copilot">Reads live incident state, focuses agent desks and opens panels. Before it asks an agent anything that posts to Slack, it shows an Approve and send card. Runs inside our API behind the same session and spend cap.</Card>
      <Card title="Ambiguous Workspace follow-through">Every human-owned incident task is mirrored onto the team's Ambiguous task board with its status kept in sync, and each handoff report is published as an Ambiguous doc. One-way, so the board can never confirm a physical action.</Card>
    </div>
  </> },
  { label: "Engineering", kicker: "08 · Built for failure", title: "Designed for timeouts, restarts and double clicks", body: <>
    <div className="slide-cols">
      <Card title="Uncertain, not resent">A timed-out Slack send is flagged for a supervisor instead of paging someone twice. At most {FACTS.deliveryAttempts} attempts.</Card>
      <Card title="Stale is rejected">Idempotency keys and version checks stop old buttons and repeated submissions from overwriting newer state.</Card>
      <Card title="Honest recovery">After a restart, interrupted work is marked failed or uncertain. A failed tool can never become a successful agent.</Card>
    </div>
    <div className="slide-stats compact">
      <div><b>{FACTS.backendTests}</b><span>backend tests</span></div>
      <div><b>{FACTS.frontendTests}</b><span>frontend tests</span></div>
      <div><b>$</b><span>reserved before every model and search call</span></div>
    </div>
  </> },
  { label: "Scope", kicker: "09 · Honest scope", title: "What it is today, and what comes next", body: <>
    <div className="slide-cols two">
      <div className="slide-card"><h3>Today</h3><ul><li>One Slack workspace and incident channel</li><li>Synthetic procedure, roster and office directory</li><li>Emergency-call dispatch is a labelled simulation; people are told to call 911</li><li>Dashboard deploys to Vercel; API runs as a persistent process</li></ul></div>
      <div className="slide-card"><h3>Next</h3><ul><li>Real phone escalation when a critical task goes unacknowledged</li><li>Microsoft Teams through CopilotKit channels</li><li>A library of approved procedures per site and incident type</li><li>Post-incident review generated from the event log</li></ul></div>
    </div>
  </> },
  { label: "Close", kicker: "Thank you", title: <>A real report becomes coordinated work,<br /><span>a human-accepted handoff and a sourced record.</span></>, body: <>
    <div className="slide-links">
      <a href="#">Open the workspace</a>
      <a href="#system-design">System design</a>
      <a href="https://github.com/ritzzi23/SafeSlackForce" target="_blank" rel="noreferrer">github.com/ritzzi23/SafeSlackForce</a>
    </div>
    <p className="slide-note">Built by Om and Ritesh during the hackathon. OpenRouter · Exa · CopilotKit · Ambiguous AI · Slack Bolt · React · three.js</p>
  </> },
];

export default function Presentation({ print = false }: { print?: boolean }) {
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const go = useCallback((n: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, n))), []);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.current?.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); setIndex(i => Math.min(SLIDES.length - 1, i + 1)); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
      else if (e.key.toLowerCase() === "f") toggleFull();
    };
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey); document.addEventListener("fullscreenchange", onFull);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFull); };
  }, [go, toggleFull]);
  const slide = SLIDES[index];
  if (print) {
    // One landscape page per slide, used to export docs/SafeSlackForce-Presentation.pdf.
    return (
      <div className="print-deck">
        {SLIDES.map((s, i) => (
          <article key={s.label} className={`slide print-slide ${i === 0 || i === SLIDES.length - 1 ? "slide-hero" : ""}`}>
            <p className="slide-kicker">{s.kicker}</p>
            <h2>{s.title}</h2>
            <div className="slide-body">{s.body}</div>
            <span className="print-footer">SafeSlackForce · {String(i + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}</span>
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="explain-page">
      {!full && <ExplainNav current="presentation" />}
      <main className="explain-main deck-main">
        {!full && <header className="explain-heading">
          <div><p className="explain-eyebrow">Presentation</p><h1>The submission in {SLIDES.length} slides</h1><p>Arrow keys or the controls below. Press F to present fullscreen. Every claim is backed by the workspace or the code.</p></div>
          <span className="explain-pill"><b>{index + 1} / {SLIDES.length}</b> · arrow keys work</span>
        </header>}
        <div className={`deck-shell ${full ? "is-full" : ""}`} ref={shell}>
          <div className="deck-toolbar">
            <span className="deck-position">{String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")} · {slide.label}</span>
            <button type="button" className="deck-button" onClick={toggleFull} aria-pressed={full}>{full ? "Exit fullscreen" : "Fullscreen (F)"}</button>
          </div>
          <article className={`slide ${index === 0 || index === SLIDES.length - 1 ? "slide-hero" : ""}`} aria-live="polite" aria-roledescription="slide" aria-label={`${index + 1} of ${SLIDES.length}: ${slide.label}`}>
            <p className="slide-kicker">{slide.kicker}</p>
            <h2>{slide.title}</h2>
            <div className="slide-body">{slide.body}</div>
          </article>
          <div className="deck-controls">
            <button type="button" className="deck-button" onClick={() => go(index - 1)} disabled={index === 0}>← Previous</button>
            <div className="deck-dots" role="tablist" aria-label="Jump to slide">
              {SLIDES.map((s, i) => <button key={s.label} type="button" role="tab" aria-selected={i === index} aria-label={s.label} title={s.label} className={i === index ? "active" : ""} onClick={() => go(i)} />)}
            </div>
            <button type="button" className="deck-button primary" onClick={() => go(index + 1)} disabled={index === SLIDES.length - 1}>Next →</button>
          </div>
        </div>
      </main>
    </div>
  );
}
