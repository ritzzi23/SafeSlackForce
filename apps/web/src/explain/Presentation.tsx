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
    <p className="slide-hero-sub">An AI incident response team inside Slack. Agents alert management, assign work to real people, chase anyone who does not answer and write the handoff, while a named human confirms every physical action.</p>
    <div className="slide-stats">
      <div><b>{FACTS.agents}</b><span>coordinating agents</span></div>
      <div><b>{FACTS.tools}</b><span>scoped tools</span></div>
      <div><b>{FACTS.backendTests + FACTS.frontendTests}</b><span>automated tests</span></div>
      <div><b>0</b><span>physical actions an agent can confirm</span></div>
    </div>
  </> },
  { label: "Problem", kicker: "01 · Problem and environment", title: "Coordination fails in the first ten minutes, and it can only be fixed where people already are", body: <>
    <div className="slide-cols">
      <Card title="Nobody owns it">A report everyone saw and no one accepted. SafeSlackForce assigns tasks to named Slack users with Acknowledge, Review and Confirm buttons.</Card>
      <Card title="Silence goes unnoticed">Sent and acknowledged are different states. Management is alerted at once, and the backup owner is chased when nobody answers.</Card>
      <Card title="The record is rebuilt later">The thread is the system of record: who was assigned, who accepted, who confirmed, with a sourced handoff report.</Card>
    </div>
  </> },
  { label: "System design", kicker: "02 · System design", title: "One thread, one process, five agents", body: <>
    <ArchitectureDiagram />
    <p className="slide-note">No public webhook · versioned event log · live stream resumes after a disconnect · 22 design decisions in the app</p>
  </> },
  { label: "How it works", kicker: "03 · How it works", title: "Report in the thread. The team forms around it.", body: <>
    <ol className="slide-steps">
      <li><b>Report</b><span>@mention the bot in the incident channel</span></li>
      <li><b>Alert</b><span>Autopilot notifies management and schedules updates</span></li>
      <li><b>Assign</b><span>Named owners get tasks with Slack buttons</span></li>
      <li><b>Escalate</b><span>No acknowledgement, the backup is chased</span></li>
      <li><b>Correct</b><span>Join by QR; contradictions flag only affected work</span></li>
      <li><b>Hand off</b><span>Sourced report; a supervisor accepts in Slack</span></li>
    </ol>
    <div className="slide-agents">
      {AGENTS.map(a => <div key={a.id} className="slide-agent"><h3>{a.name}</h3><p>{a.job}</p></div>)}
    </div>
  </> },
  { label: "More ways in", kicker: "04 · More ways in", title: "A voice line, a copilot and a workspace", body: <>
    <div className="slide-cols">
      <Card title="Emergency call agent">{FACTS.callQuestions} spoken triage questions for the person on site. "Unconscious" or "trapped" triggers "Call 911 now" from a fixed rule, even if the model is down.</Card>
      <Card title="CopilotKit copilot">Reads live incident state, focuses agent desks and shows an Approve and send card before any question reaches Slack.</Card>
      <Card title="Ambiguous Workspace">Incident tasks mirror onto the team's task board with status in sync, and handoff reports publish as docs. One-way, so the board cannot confirm anything.</Card>
    </div>
  </> },
  { label: "Guardrails", kicker: "05 · Guardrails", title: "Autonomous for digital work. Built for failure.", body: <>
    <div className="slide-cols">
      <Card title="People confirm physical work">Alerts, schedules, evidence reviews and reports run on their own. Completing a physical task needs its owner or a supervisor and a note.</Card>
      <Card title="Uncertain, not resent">A timed-out Slack send is flagged for a supervisor instead of paging someone twice. Stale buttons are rejected by version checks.</Card>
      <Card title="Honest recovery and cost">Restarts mark interrupted work failed or uncertain, a failed tool never becomes success, and spend is reserved before every call.</Card>
    </div>
  </> },
  { label: "Close", kicker: "Thank you", title: <>A Slack report becomes coordinated work<br /><span>and a sourced, human-accepted handoff.</span></>, body: <>
    <p className="slide-lede">Today: one Slack workspace, synthetic procedures, simulated emergency dispatch. Next: real phone escalation, Microsoft Teams, and a procedure library per site.</p>
    <div className="slide-links">
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
