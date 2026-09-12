import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  ExternalLink,
  FileText,
  Hexagon,
  Hash,
  Layers3,
  Link2,
  ListTodo,
  LoaderCircle,
  MapPin,
  Maximize,
  MessageSquare,
  Minus,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  X,
} from "lucide-react";
import {
  agentIds,
  type AgentId,
  type IncidentSnapshot,
  type StreamUpdate,
} from "@incidentos/contracts";
import { departments, demoAnswer, demoSnapshot, stages } from "./data";
import { api, ApiError, safeUrl } from "./api";
import SlackThread from "./SlackThread";
import ActionReadiness from "./ActionReadiness";
import OfficeDirectory from "./OfficeDirectory";
import { IncidentJourney, NotificationInbox, useJourneyEvidence } from "./IncidentJourney";
import { PROJECT_NAME, DEMO_REPORT_FILENAME } from "./branding";
const OfficeScene = lazy(() => import("./OfficeScene"));
type Chat = {
  id: string;
  agent: AgentId;
  role: "user" | "agent";
  text: string;
  pending?: boolean;
  error?: boolean;
};
const icons = {
  commander: Command,
  procedure: BookOpen,
  evidence: ShieldCheck,
  communications: Radio,
  records: FileText,
};
function DeptIcon({ id, size = 18 }: { id: AgentId; size?: number }) {
  const Icon = icons[id];
  return <Icon size={size} />;
}
function Status({ status }: { status: string }) {
  return (
    <span className={`status-pill ${status}`}>
      <i />
      {status.replaceAll("_", " ")}
    </span>
  );
}
function time(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function Source({ label, url }: { label: string; url?: string }) {
  const href = url && safeUrl(url);
  return href ? (
    <a className="source" href={href} target="_blank" rel="noreferrer">
      <Link2 size={12} />
      {label}
      <ExternalLink size={11} />
    </a>
  ) : (
    <span className="source">
      <FileText size={12} />
      {label}
    </span>
  );
}
export default function App() {
  const [snapshot, setSnapshot] = useState<IncidentSnapshot>(() =>
    demoSnapshot(1),
  );
  const [selected, setSelected] = useState<AgentId>("commander");
  const [tab, setTab] = useState<"chat" | "tasks" | "activity" | "thread" | "office" | "notifications">(
    "chat",
  );
  const [roomFocus, setRoomFocus] = useState(true);
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const [transport, setTransport] = useState("disconnected");
  const journeyEvidence = useJourneyEvidence(snapshot, live);
  const [handoff, setHandoff] = useState<StreamUpdate["handoff"]>();
  const [zoom, setZoom] = useState(1);
  const [reset, setReset] = useState(0);
  const [input, setInput] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [modal, setModal] = useState<"connect" | "help" | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [backendMode, setBackendMode] = useState<"fixture" | "live" | null>(null);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState("");
  const [incidents, setIncidents] = useState<
    { incidentId: string; title: string; status: string }[]
  >([]);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const [pending, setPending] = useState<{ id: string; agent: AgentId } | null>(
    null,
  );
  const [mobileScene, setMobileScene] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dialog = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const agent = snapshot.agents.find((a) => a.id === selected)!;
  const department = departments[selected];
  const blockers = snapshot.tasks.filter((t) =>
    ["blocked", "needs_review", "failed"].includes(t.status),
  );
  const openTasks = snapshot.tasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status),
  );
  const working = snapshot.agents.filter((a) => a.status === "working").length;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const health = await api.health();
        if (cancelled) return;
        setBackendMode(health.mode);
        const list = await api.incidents();
        if (cancelled) return;
        setPaired(true);
        setIncidents(list);
        if (list.length) {
          const next = await api.snapshot(list[0].incidentId);
          if (cancelled) return;
          setSnapshot(next); setLive(true); setPlaying(false);
        } else setModal("connect");
      } catch {
        // Standalone preview still works when the API is offline or pairing is required.
      }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setReduced(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    if (live) return;
    setSnapshot(demoSnapshot(step));
    if (step === 1)
      setHandoff({
        from: "commander",
        to: "procedure",
        taskId: `demo-${Date.now()}`,
      });
    if (step === 3)
      setHandoff({
        from: "evidence",
        to: "commander",
        taskId: `demo-${Date.now()}`,
      });
  }, [step, live]);
  useEffect(() => {
    if (!playing || live) return;
    const t = setInterval(
      () =>
        setStep((s) => {
          if (s >= 4) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        }),
      5200,
    );
    return () => clearInterval(t);
  }, [playing, live]);
  useEffect(() => {
    if (!live) return;
    setTransport("reconnecting");
    return api.stream(
      snapshot.incidentId,
      snapshot.cursor,
      (event) => {
        setSnapshot((s) =>
          event.snapshot.version > s.version ? event.snapshot : s,
        );
        if (event.handoff) setHandoff(event.handoff);
      },
      setTransport,
      setError,
    );
  }, [live, snapshot.incidentId]);
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const poll = async () => {
      try {
        const result = await api.answer(pending.id);
        if (cancelled) return;
        if (result.status === "pending") {
          if (++count >= 120) {
            setError(
              "This response is taking longer than expected. Reconnect to inspect the latest state.",
            );
            setPending(null);
            setChats((c) =>
              c.map((m) =>
                m.id === pending.id
                  ? {
                      ...m,
                      pending: false,
                      error: true,
                      text: "Response still pending on the server. Inspect the incident activity before submitting again.",
                    }
                  : m,
              ),
            );
            return;
          }
          timer = setTimeout(poll, 1000);
          return;
        }
        setChats((c) =>
          c.map((m) =>
            m.id === pending.id
              ? {
                  ...m,
                  pending: false,
                  error: result.status === "failed",
                  text:
                    result.answer || result.error || "No answer was returned.",
                }
              : m,
          ),
        );
        setPending(null);
      } catch (e) {
        if (cancelled) return;
        setChats((c) =>
          c.map((m) =>
            m.id === pending.id
              ? {
                  ...m,
                  pending: false,
                  error: true,
                  text:
                    e instanceof Error
                      ? e.message
                      : "Unable to load the response.",
                }
              : m,
          ),
        );
        setPending(null);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "nearest",
    });
  }, [chats, selected, tab, reduced]);
  useEffect(() => {
    if (!modal) return;
    const prior = document.activeElement as HTMLElement | null;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab" && dialog.current) {
        const controls = Array.from(
          dialog.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, [href], [tabindex="0"]',
          ),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => {
      window.removeEventListener("keydown", f);
      prior?.focus();
    };
  }, [modal]);
  function select(id: AgentId) {
    setSelected(id);
    setTab("chat");
  }
  async function send(text = input) {
    if (!text.trim() || pending || sendLock.current) return;
    const question = text.trim();
    const id = crypto.randomUUID();
    const target = selected;
    setInput("");
    setTab("chat");
    setError("");
    setChats((c) => [
      ...c,
      { id: `user-${id}`, agent: target, role: "user", text: question },
    ]);
    if (!live) {
      setChats((c) => [
        ...c,
        {
          id,
          agent: target,
          role: "agent",
          text: demoAnswer(target, question, snapshotRef.current),
        },
      ]);
      return;
    }
    sendLock.current = true;
    setSending(true);
    setChats((c) => [
      ...c,
      {
        id,
        agent: target,
        role: "agent",
        text: "Reviewing the shared incident…",
        pending: true,
      },
    ]);
    try {
      await api.ask(
        snapshot.incidentId,
        target,
        question,
        snapshot.version,
        id,
      );
      setPending({ id, agent: target });
    } catch (e) {
      let message = e instanceof Error ? e.message : "Unable to send question.";
      if (e instanceof ApiError && e.status === 409) {
        message =
          "The incident changed. I refreshed the latest state; please review it and send your question again.";
        try {
          setSnapshot(await api.snapshot(snapshot.incidentId));
        } catch {
          message += " Refresh failed; reconnect to the backend.";
        }
      }
      setChats((c) =>
        c.map((m) =>
          m.id === id
            ? { ...m, pending: false, error: true, text: message }
            : m,
        ),
      );
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }
  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const health = await api.health();
      setBackendMode(health.mode);
      await api.pair(token);
      setPaired(true);
      setToken("");
      const list = await api.incidents();
      setIncidents(list);
      if (!list.length) {
        setError(
          health.mode === "fixture"
            ? "Paired to the offline backend. Create a fixture incident below; no Slack messages or paid model calls will be made."
            : "Connected, but no incidents exist yet. Report an incident in Slack, then refresh the incident list.",
        );
        return;
      }
      const next = await api.snapshot(list[0].incidentId);
      setPlaying(false);
      setSnapshot(next);
      setChats([]);
      setLive(true);
      setModal(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection failed. Check that the backend is running on port 4100.",
      );
    } finally {
      setConnecting(false);
    }
  }
  async function refreshIncidents() {
    setConnecting(true);
    setError("");
    try {
      const health = await api.health();
      setBackendMode(health.mode);
      const list = await api.incidents();
      setPaired(true);
      setIncidents(list);
      if (list.length) {
        setSnapshot(await api.snapshot(list[0].incidentId));
        setLive(true);
        setPlaying(false);
        setChats([]);
        setModal(null);
      } else
        setError(
          health.mode === "fixture" ? "No fixture incidents yet. Create an offline rehearsal below." : "No incidents yet. Create one in the configured Slack channel.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      setConnecting(false);
    }
  }
  async function createFixture() {
    setConnecting(true); setError("");
    try {
      const next = await api.createFixture();
      setIncidents(await api.incidents()); setSnapshot(next); setLive(true);
      setPlaying(false); setChats([]); setModal(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create a fixture incident."); }
    finally { setConnecting(false); }
  }
  async function changeIncident(id: string) {
    if (pending) return;
    try {
      setSnapshot(await api.snapshot(id));
      setChats([]);
      setSelected("commander");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load incident.");
    }
  }
  function download() {
    if (live) {
      const report = snapshot.reports.at(-1);
      if (report) {
        const url = safeUrl(report.downloadUrl);
        if (url) window.open(url, "_blank", "noopener");
      }
      return;
    }
    const body = `# ${PROJECT_NAME} · Demo handoff report\n\nSYNTHETIC DEMO — no live Slack or model activity.\n\nIncident: ${snapshot.title}\nStatus: ${snapshot.status}\n\n## Outstanding and completed work\n${snapshot.tasks.map((t) => `- ${t.title}: ${t.status}; owner: ${t.owner?.name}`).join("\n")}\n\n## Timeline\n${snapshot.activity.map((a) => `- ${a.text}`).join("\n")}\n\nSources: synthetic warehouse procedure and fictional witness accounts.\nHandoff acceptance does not confirm physical completion or incident closure.\n`;
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = DEMO_REPORT_FILENAME;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const agentChats = chats.filter((c) => c.agent === selected);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${PROJECT_NAME} home`}>
          <span className="brand-mark">
            <Hexagon size={27} />
            <Plus size={13} />
          </span>
          <span className="brand-name">{PROJECT_NAME}</span>
          <span className="brand-divider" />
          <span className="brand-caption">THE AGENT WORKSPACE</span>
        </a>
        <div className="topbar-right">
          <span
            className={`environment ${live && snapshot.mode === "live" ? "is-live" : ""}`}
          >
            <i />
            {live
              ? snapshot.mode === "fixture"
                ? "BACKEND FIXTURE"
                : "LIVE WORKSPACE"
              : "INTERACTIVE DEMO"}
          </span>
          <button
            className="icon-button help"
            aria-label="About this workspace"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={18} />
          </button>
          <span className="topbar-divider" />
          <span className="user-avatar">RO</span>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Workspace navigation">
          <button
            className="rail-button active"
            aria-label="Office overview"
            onClick={() => {
              setSelected("commander");
              setReset((n) => n + 1);
              setTab("chat");
            }}
          >
            <Layers3 size={21} />
          </button>
          <button
            className={`rail-button ${tab === "tasks" ? "current" : ""}`}
            aria-label="Incident tasks"
            onClick={() => setTab("tasks")}
          >
            <ListTodo size={21} />
            {blockers.length > 0 && <i />}
          </button>
          <button
            className={`rail-button ${tab === "activity" ? "current" : ""}`}
            aria-label="Incident timeline"
            onClick={() => setTab("activity")}
          >
            <AudioLines size={21} />
          </button>
          <button className={`rail-button ${tab === "office" ? "current" : ""}`} aria-label="Office reference database" title="Office reference database" onClick={() => setTab("office")}><BookOpen size={21} /></button>
          <button className={`rail-button ${tab === "notifications" ? "current" : ""}`} aria-label="Notifications and responses" title="Notifications and responses" onClick={() => setTab("notifications")}><Bell size={21} />{journeyEvidence?.data?.tasks.some(t => t.notifications.some(n => !n.acknowledgedBy || ['failed', 'uncertain'].includes(n.state))) && <i />}</button>
          <span className="rail-line" />
          {agentIds.map((id) => (
            <button
              key={id}
              className={`rail-agent ${selected === id ? "selected" : ""}`}
              style={
                {
                  "--department": departments[id].color,
                  "--pale": departments[id].pale,
                } as React.CSSProperties
              }
              aria-label={`Select ${departments[id].name}`}
              title={departments[id].name}
              onClick={() => select(id)}
            >
              <DeptIcon id={id} />
            </button>
          ))}
          <button
            className="rail-button rail-bottom"
            aria-label="Connect backend"
            onClick={() => setModal("connect")}
          >
            <Settings2 size={20} />
          </button>
        </nav>
        <main
          className={`office ${mobileScene ? "mobile-visible" : ""} ${roomFocus ? "room-focus" : ""}`}
        >
          <div className="office-heading">
            <div className="breadcrumb">
              WORKSPACE <ChevronRight size={12} /> INCIDENT RESPONSE
            </div>
            <div className="office-title">
              <h1>{live ? "Incident command office." : "Dock B. Command office."}</h1>
              <span className="office-badge">
                <i />
                {snapshot.agents.length} agents
              </span>
            </div>
            <p>Your Commander coordinates. Your team takes action.</p>
          </div>
          <div className="incident-strip">
            <span className="incident-indicator">
              <Radio size={17} />
            </span>
            <div>
              <div className="incident-meta">
                <span>{snapshot.incidentId}</span>
                <span className="incident-dot">·</span>
                <span>{snapshot.status.replaceAll("_", " ")}</span>
              </div>
              {live && incidents.length > 1 ? (
                <select
                  aria-label="Select incident"
                  disabled={!!pending || sending}
                  value={snapshot.incidentId}
                  onChange={(e) => void changeIncident(e.target.value)}
                >
                  {incidents.map((i) => (
                    <option key={i.incidentId} value={i.incidentId}>
                      {i.title}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{snapshot.title}</strong>
              )}
            </div>
            <div className="incident-location">
              <MapPin size={13} />
              {snapshot.location}
            </div>
            {snapshot.slackThreadUrl ? (
              <a
                className="slack-link"
                href={safeUrl(snapshot.slackThreadUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Open Slack <ExternalLink size={13} />
              </a>
            ) : (
              <button
                className="slack-link"
                onClick={() => setModal("connect")}
              >
                Connect Slack <ExternalLink size={13} />
              </button>
            )}
          </div>
          <IncidentJourney snapshot={snapshot} evidence={journeyEvidence?.data} connected={live} transport={transport} onOpen={setTab} />
          <div className="scene-area">
            <div className="scene-caption">
              <span className="tiny-square" /> WAREHOUSE OPERATIONS
              <span>Drag to explore · Select an agent</span>
            </div>
            <Suspense
              fallback={
                <div className="scene-loading">
                  <LoaderCircle className="spin" size={24} />
                  <span>Preparing your workspace…</span>
                </div>
              }
            >
              <OfficeScene
                snapshot={snapshot}
                selected={selected}
                onSelect={select}
                reset={reset}
                zoom={zoom}
                handoff={handoff}
                reduced={reduced}
              />
            </Suspense>
            <div className="scene-legend">
              <span>
                <i className="working-dot" />
                Working
              </span>
              <span>
                <i className="waiting-dot" />
                Waiting
              </span>
              <span>
                <i className="blocked-dot" />
                Needs review
              </span>
            </div>
            <div className="scene-controls">
              <button
                aria-label={
                  roomFocus
                    ? "Show workspace overview"
                    : "Expand command office"
                }
                aria-pressed={roomFocus}
                onClick={() => setRoomFocus((v) => !v)}
              >
                <Maximize size={16} />
              </button>
              <span />

              <button
                aria-label="Zoom in"
                onClick={() => setZoom((v) => Math.min(1.6, v + 0.15))}
              >
                <Plus size={17} />
              </button>
              <button
                aria-label="Zoom out"
                onClick={() => setZoom((v) => Math.max(0.65, v - 0.15))}
              >
                <Minus size={17} />
              </button>
              <span />
              <button
                aria-label="Reset office view"
                onClick={() => {
                  setZoom(1);
                  setReset((v) => v + 1);
                  setSelected("commander");
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="office-bottom">
            <div className="team-pulse">
              <span className="pulse-icon">
                <AudioLines size={19} />
              </span>
              <div>
                <strong>
                  {blockers.length
                    ? "A little clarity goes a long way."
                    : snapshot.status === "handed_over"
                      ? "Coordinated. Documented. Handed over."
                      : "Every action, moving together."}
                </strong>
                <p>
                  {blockers.length
                    ? `${blockers.length} task needs human review. Your team has the evidence ready.`
                    : `${openTasks.length} open tasks · ${working} ${working === 1 ? "agent" : "agents"} working · One shared incident`}
                </p>
              </div>
              <button
                aria-label="Show team activity"
                onClick={() => setTab("activity")}
              >
                <ArrowRight size={18} />
              </button>
            </div>
            {!live ? (
              <div className="demo-control">
                <div className="demo-heading">
                  <span>
                    <Sparkles size={13} /> DEMO SCENARIO
                  </span>
                  <button
                    className="demo-play"
                    onClick={() => {
                      if (!playing && step >= 4) setStep(0);
                      if (!playing && step === 2) setStep(0);
                      setPlaying((v) => !v);
                    }}
                  >
                    {playing ? <Pause size={12} /> : <Play size={12} />}{" "}
                    {playing ? "Pause" : "Play demo"}
                  </button>
                </div>
                <div className="stage-track">
                  {stages.map((label, i) => (
                    <button
                      key={label}
                      className={`stage ${i === step ? "current" : ""} ${i < step ? "past" : ""}`}
                      onClick={() => {
                        setPlaying(false);
                        setStep(i);
                      }}
                      aria-label={`Demo stage ${i + 1}: ${label}`}
                      aria-current={i === step ? "step" : undefined}
                    >
                      <span>{i < step ? <Check size={10} /> : i + 1}</span>
                      <small>{label}</small>
                    </button>
                  ))}
                </div>
                <span className="demo-disclosure">
                  Simulated events & responses. No live Slack messages or model
                  calls.
                </span>
              </div>
            ) : (
              <div className="live-footer">
                <Wifi size={14} />
                <span>
                  Event stream: {transport} · Slack: {snapshot.slackConnection}
                </span>
                <button
                  onClick={() => {
                    setLive(false);
                    setPending(null);
                    setChats([]);
                    setStep(1);
                  }}
                >
                  Return to demo
                </button>
              </div>
            )}
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-heading">
            <span>YOUR RESPONSE TEAM</span>
            <button
              className="mobile-toggle"
              onClick={() => setMobileScene((v) => !v)}
            >
              <Layers3 size={15} />
              {mobileScene ? "Hide office" : "View office"}
            </button>
            <span className="team-count">
              0{agentIds.indexOf(selected) + 1} / 05
            </span>
          </div>
          <div className="agent-profile">
            <div
              className={`agent-portrait ${selected}`}
              style={
                {
                  "--department": department.color,
                  "--pale": department.pale,
                } as React.CSSProperties
              }
            >
              <DeptIcon id={selected} size={26} />
              <i className={agent.status} />
            </div>
            <div>
              <h2>
                {department.name}
                <ChevronDown size={14} />
              </h2>
              <p>{department.role}</p>
            </div>
            <button
              className="profile-menu"
              aria-label="Return to Commander"
              onClick={() => select("commander")}
            >
              <Command size={17} />
            </button>
          </div>
          <div
            className="team-switcher"
            role="group"
            aria-label="Choose an agent"
          >
            {agentIds.map((id) => (
              <button
                key={id}
                title={departments[id].name}
                aria-label={`Chat with ${departments[id].name}`}
                aria-pressed={selected === id}
                className={selected === id ? "selected" : ""}
                style={
                  {
                    "--department": departments[id].color,
                    "--pale": departments[id].pale,
                  } as React.CSSProperties
                }
                onClick={() => select(id)}
              >
                <DeptIcon id={id} size={15} />
                <span>
                  {id === "communications" ? "Comms" : departments[id].name}
                </span>
              </button>
            ))}
          </div>
          <div className="panel-tabs" role="tablist" aria-label="Agent panels">
            {(["chat", "tasks", "thread", "activity"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t === "chat" ? (
                  <MessageSquare size={14} />
                ) : t === "tasks" ? (
                  <ListTodo size={14} />
                ) : t === "thread" ? (
                  <Hash size={14} />
                ) : (
                  <AudioLines size={14} />
                )}
                <span>
                  {t === "chat"
                    ? "Chat"
                    : t === "tasks"
                      ? "Tasks"
                      : t === "thread"
                        ? "Slack"
                        : "Activity"}
                </span>
                {t === "tasks" && <b>{snapshot.tasks.length}</b>}
              </button>
            ))}
          </div>
          {error && modal === null && (
            <div role="alert" className="inline-error">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="panel-content" role="tabpanel">
            <div className="mobile-journey"><IncidentJourney snapshot={snapshot} evidence={journeyEvidence?.data} connected={live} transport={transport} onOpen={setTab} /></div>
            {tab === "notifications" ? <NotificationInbox key={snapshot.incidentId} snapshot={snapshot} data={journeyEvidence?.data} error={journeyEvidence?.error} connected={live} /> : tab === "office" ? <OfficeDirectory connected={live} /> : tab === "chat" ? (
              <>
                <div className="conversation-date">
                  <span />
                  {live ? "SHARED INCIDENT CONTEXT" : "DEMO CONVERSATION"}
                  <span />
                </div>
                <div className="assistant-message">
                  <div className="message-byline">
                    <span
                      className="mini-agent"
                      style={{ color: department.color }}
                    >
                      <DeptIcon id={selected} size={13} />
                    </span>
                    <strong>{department.name}</strong>
                    <span>{live ? "Agent context" : "Demo"}</span>
                  </div>
                  <div className="message-body">
                    <p>
                      {selected === "commander" ? (
                        <>
                          I’m your Commander.{" "}
                          <strong>
                            Let’s bring the right people and information
                            together.
                          </strong>
                        </>
                      ) : (
                        <>
                          I’m the {department.name} agent. {department.role} are
                          my focus.
                        </>
                      )}
                    </p>
                    <p>{agent.summary}</p>
                    <div className="context-card">
                      <div>
                        <span className="context-icon">
                          <DeptIcon id={selected} size={14} />
                        </span>
                        <span>
                          {selected === "commander"
                            ? "TEAM STATUS"
                            : "CURRENT ASSIGNMENT"}
                        </span>
                        <Status status={agent.status} />
                      </div>
                      <p>
                        {selected === "commander"
                          ? `${snapshot.agents.length - 1} specialists share the same incident. ${openTasks.length} tasks have owners and ${blockers.length} need review.`
                          : agent.waitingOn || agent.summary}
                      </p>
                      <button onClick={() => setTab("tasks")}>
                        Inspect tasks & sources <ArrowRight size={12} />
                      </button>
                    </div>
                    {!!agent.sources.length && (
                      <div className="message-sources">
                        {agent.sources.map((s) => (
                          <Source key={s.id} label={s.label} url={s.url} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {agentChats.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user" ? "user-message" : "assistant-message"
                    }
                  >
                    {m.role === "agent" && (
                      <div className="message-byline">
                        <span className="mini-agent">
                          <DeptIcon id={selected} size={13} />
                        </span>
                        <strong>{department.name}</strong>
                        <span>{live ? "Agent" : "Demo response"}</span>
                      </div>
                    )}
                    <div
                      className={`message-body ${m.error ? "message-error" : ""}`}
                    >
                      {m.pending && <LoaderCircle size={14} className="spin" />}
                      <p>{m.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </>
            ) : tab === "thread" ? (
              <SlackThread
                snapshot={snapshot}
                connected={live}
                onConnect={() => setModal("connect")}
              />
            ) : tab === "tasks" ? (
              <>
                <div className="panel-section-heading">
                  <h3>Incident tasks</h3>
                  <span>{openTasks.length} open</span>
                </div>
                <p className="panel-intro">
                  Shared across the team. Human actions are confirmed in Slack.
                </p>
                {live && <ActionReadiness incidentId={snapshot.incidentId} version={snapshot.version} />}
                {!snapshot.tasks.length ? (
                  <div className="empty-state">
                    <ListTodo size={28} />
                    <h3>No tasks assigned yet</h3>
                    <p>
                      The Commander will delegate after reviewing the report.
                    </p>
                  </div>
                ) : (
                  snapshot.tasks.map((t) => (
                    <div
                      key={t.id}
                      className={`task-card ${t.status === "needs_review" ? "needs-review" : ""}`}
                    >
                      <div className="task-top">
                        <span
                          className="task-department"
                          style={{ color: departments[t.agentId].color }}
                        >
                          <DeptIcon id={t.agentId} size={13} />
                          {departments[t.agentId].name}
                        </span>
                        <Status status={t.status} />
                      </div>
                      <h3>{t.title}</h3>
                      <div className="task-owner">
                        <span>{t.owner?.name.slice(0, 1) || "?"}</span>
                        {t.owner?.name || "Unassigned"}
                        <small>Task owner</small>
                      </div>
                      {t.blockedReason && (
                        <p className="blocker-note">{t.blockedReason}</p>
                      )}
                      <div className="task-sources">
                        {t.sources.map((s) => (
                          <Source key={s.id} label={s.label} url={s.url} />
                        ))}
                      </div>
                      {t.slackActionUrl ? (
                        <a
                          className="task-action"
                          href={safeUrl(t.slackActionUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Respond in Slack <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="task-demo-note">
                          Demo task · approvals happen in Slack
                        </span>
                      )}
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <div className="panel-section-heading">
                  <h3>Incident timeline</h3>
                  <span>{snapshot.activity.length} events</span>
                </div>
                <p className="panel-intro">
                  The shared record of what happened and who acted.
                </p>
                <div className="timeline">
                  {[...snapshot.activity].reverse().map((a, i) => (
                    <div className="timeline-event" key={a.id}>
                      <span
                        className={`timeline-dot ${i === 0 ? "latest" : ""}`}
                      />
                      <time>{time(a.timestamp)}</time>
                      <p>{a.text}</p>
                      {a.sources.map((s) => (
                        <Source key={s.id} label={s.label} url={s.url} />
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {tab === "chat" && (
            <div className="composer-area">
              <div className="suggested-questions">
                {["What needs attention?", "What happens next?"].map((q) => (
                  <button
                    key={q}
                    disabled={!!pending || sending}
                    onClick={() => void send(q)}
                  >
                    {q}
                    <ArrowUp size={11} />
                  </button>
                ))}
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  aria-label={`Message ${department.name}`}
                  placeholder={`Ask ${department.name} anything about this incident…`}
                  value={input}
                  maxLength={4000}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-bottom">
                  <span>
                    <span className="composer-dot" />
                    {live ? "Shared with Slack" : "Demo response mode"}
                  </span>
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={!input.trim() || !!pending || sending}
                  >
                    {pending ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <ArrowUp size={18} />
                    )}
                  </button>
                </div>
              </form>
              <p className="composer-note">
                <ShieldCheck size={11} />
                People approve. Agents coordinate.
              </p>
            </div>
          )}
          <div className="inspector-footer">
            <span>
              <CheckCheck size={14} />
              {snapshot.reports.length
                ? "Handoff report ready"
                : "Every action leaves a record"}
            </span>
            <button
              onClick={download}
              disabled={!snapshot.reports.length}
              aria-label="Download handoff report"
            >
              <ArrowDownToLine size={15} />
            </button>
          </div>
        </aside>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            ref={dialog}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            <span className="modal-emblem">
              {modal === "connect" ? <Wifi size={26} /> : <Layers3 size={26} />}
            </span>
            <h2 id="modal-title">
              {modal === "connect"
                ? "Connect your workspace"
                : "One incident. One shared picture."}
            </h2>
            {modal === "connect" ? (
              <>
                <p>
                  Pair with Om’s backend to receive agent activity, send
                  questions, and open the incident’s Slack thread.
                </p>
                {backendMode === "fixture" && <p className="field-hint">Offline backend: persisted fixture workflow only. Slack delivery and model inference are disabled until live mode is configured.</p>}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void connect();
                  }}
                >
                  <label htmlFor="pair-token">Dashboard pairing token</label>
                  <input
                    autoFocus
                    id="pair-token"
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter your backend pairing token"
                  />
                  <span className="field-hint">
                    The frontend proxies /api to localhost:4100. Your token is
                    exchanged for a session cookie.
                  </span>
                  {error && (
                    <div role="alert" className="modal-error">
                      {error}
                    </div>
                  )}
                  <button
                    className="primary-button"
                    disabled={!token || connecting}
                  >
                    {connecting ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Link2 size={16} />
                    )}
                    Pair workspace
                  </button>
                </form>
                <button
                  className="text-button"
                  disabled={connecting}
                  onClick={() => void refreshIncidents()}
                >
                  Already paired? Refresh incidents <RotateCcw size={13} />
                </button>
                {paired && backendMode === "fixture" && <button className="primary-button" disabled={connecting} onClick={() => void createFixture()}>Create offline rehearsal</button>}
              </>
            ) : (
              <>
                <p>
                  A living office for incident coordination. The Commander
                  delegates to four specialists; every desk shows the same state
                  as the shared incident.
                </p>
                <ul>
                  <li>
                    Select an agent to inspect its work and ask a question.
                  </li>
                  <li>
                    Use the demo stages to show the full coordination story.
                  </li>
                  <li>
                    Connect the backend for real events and agent responses.
                  </li>
                  <li>Confirm actions and accept handoffs in Slack.</li>
                </ul>
                <p className="field-hint">
                  This local demo uses fictional data and scripted responses.
                  Original scene geometry inspired by the Agents Office
                  reference.
                </p>
                <button
                  autoFocus
                  className="primary-button"
                  onClick={() => setModal(null)}
                >
                  Explore the office <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
