import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
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
} from "@safeslackforce/contracts";
import { departments, demoAnswer, demoSnapshot, stages } from "./data";
import { api, ApiError, linkedIncidentId, safeUrl } from "./api";
import SlackThread from "./SlackThread";
import ActionReadiness from "./ActionReadiness";
import OfficeDirectory from "./OfficeDirectory";
import IncidentShare from "./IncidentShare";
import ResponseBoard from "./ResponseBoard";
import WaitingOffice from "./WaitingOffice";
import ThemeToggle from "./ThemeToggle";
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
const panelNames = { chat: "Chat", tasks: "Tasks", thread: "Slack", activity: "Activity", office: "Directory" };
const panelIds = ["chat", "tasks", "thread", "activity", "office"] as const;
const agentExplanations: Record<AgentId, string> = {
  commander: "Coordinates the specialists and keeps the response on track.",
  procedure: "Finds the right procedure and turns it into clear next steps.",
  evidence: "Checks the facts and flags information that needs a second look.",
  communications: "Keeps responders informed and tracks who has acknowledged.",
  records: "Builds the timeline and prepares a report for the next team.",
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
  const [tab, setTab] = useState<"chat" | "tasks" | "activity" | "thread" | "office">(
    "chat",
  );
  const [roomFocus, setRoomFocus] = useState(false);
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const [transport, setTransport] = useState("disconnected");
  const [handoff, setHandoff] = useState<StreamUpdate["handoff"]>();
  const [zoom, setZoom] = useState(1.6);
  const [reset, setReset] = useState(0);
  const [input, setInput] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [modal, setModal] = useState<"connect" | "help" | "share" | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [backendMode, setBackendMode] = useState<"fixture" | "live" | null>(null);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState("");
  const [incidents, setIncidents] = useState<
    { incidentId: string; title: string; status: string }[]
  >([]);
  const [sending, setSending] = useState(false);
  const [loadingIncident, setLoadingIncident] = useState(false);
  const loadRequest = useRef(0);
  const activeIncident = useRef<string | null>(null);
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
  const acceptSnapshot = useCallback((next: IncidentSnapshot) => {
    setSnapshot(current => current.incidentId === next.incidentId && current.version > next.version ? current : next);
  }, []);
  const activateIncident = useCallback((next: IncidentSnapshot) => {
    activeIncident.current = next.incidentId;
    acceptSnapshot(next);
    setLive(true); setPlaying(false); setChats([]); setInput("");
    setSelected("commander"); setHandoff(undefined); setModal(null);
  }, [acceptSnapshot]);
  const requirePairing = useCallback(() => {
    loadRequest.current++;
    activeIncident.current = null;
    setPaired(false); setConnecting(false); setLoadingIncident(false);
    setPending(null); setTransport("disconnected"); setModal("connect");
    setError("Your workspace session expired or the API restarted. Pair again to reconnect.");
  }, []);
  const openConnection = useCallback(() => setModal("connect"), []);
  const receiveFirstIncident = useCallback((next: IncidentSnapshot, list: typeof incidents) => {
    loadRequest.current++;
    setIncidents(list); activateIncident(next);
    const url = new URL(window.location.href); url.searchParams.set("incidentId", next.incidentId);
    window.history.replaceState(null, "", url);
  }, [activateIncident]);
  const agent = snapshot.agents.find((a) => a.id === selected)!;
  const department = departments[selected];
  const blockers = snapshot.tasks.filter((t) =>
    ["blocked", "needs_review", "failed"].includes(t.status),
  );
  const openTasks = snapshot.tasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status),
  );
  const working = snapshot.agents.filter((a) => a.status === "working").length;
  const nextAction = blockers.length
    ? { title: `${blockers.length} ${blockers.length === 1 ? "task needs" : "tasks need"} your attention`, description: "Review the flagged tasks and their sources. Add your clarification in Slack.", action: "Review tasks", panel: "tasks" as const }
    : snapshot.status === "closed"
      ? { title: "This incident is closed", description: "Review the recorded actions or download the latest handoff report.", action: "View timeline", panel: "activity" as const }
      : snapshot.status === "handed_over"
        ? { title: "Handoff accepted. Keep track of the follow-through.", description: `${openTasks.length} tasks remain open. A handoff does not confirm that physical work is complete.`, action: "View open tasks", panel: "tasks" as const }
        : openTasks.length
          ? { title: "Your team has a plan. See what happens next.", description: "Agents organize the response. Assigned people confirm actions in Slack.", action: "View tasks", panel: "tasks" as const }
          : { title: "Start with the incident report", description: "Ask the Commander for a summary, then follow the team as tasks are assigned.", action: "Ask Commander", panel: "chat" as const };
  useEffect(() => {
    let cancelled = false;
    const request = ++loadRequest.current;
    const obsolete = () => cancelled || request !== loadRequest.current;
    void (async () => {
      try {
        const health = await api.health();
        if (obsolete()) return;
        setBackendMode(health.mode);
        const list = await api.incidents();
        if (obsolete()) return;
        setPaired(true);
        setIncidents(list);
        if (list.length) {
          const next = await api.snapshot(linkedIncidentId(list, window.location.search)!);
          if (obsolete()) return;
          activateIncident(next);
        } else setModal(health.mode === "fixture" ? "connect" : null);
      } catch {
        // Standalone preview still works when the API is offline or pairing is required.
      }
    })();
    return () => { cancelled = true; loadRequest.current++; };
  }, [activateIncident]);
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
    if (!live || !paired) return;
    let active = true;
    const incidentId = snapshot.incidentId;
    activeIncident.current = incidentId;
    setTransport("reconnecting");
    const close = api.stream(
      snapshot.incidentId,
      snapshot.cursor,
      (event) => {
        if (!active || activeIncident.current !== incidentId || event.snapshot.incidentId !== incidentId) return;
        setSnapshot((s) =>
          s.incidentId === incidentId && event.snapshot.version > s.version ? event.snapshot : s,
        );
        if (event.handoff) setHandoff(event.handoff);
      },
      (state) => {
        if (!active) return;
        setTransport(state);
        if (state === "reconnecting") void api.incidents().catch(e => {
          if (active && activeIncident.current === incidentId && e instanceof ApiError && e.status === 401) requirePairing();
        });
      },
      message => { if (active) setError(message); },
    );
    return () => { active = false; close(); };
  }, [live, paired, snapshot.incidentId, requirePairing]);
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
    setMobileScene(false);
  }
  function showPanel(panel: typeof tab) {
    setTab(panel);
    setMobileScene(false);
  }
  async function send(text = input) {
    if (!text.trim() || pending || sendLock.current || loadingIncident || connecting || (live && !paired)) return;
    const request = loadRequest.current;
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
      if (request !== loadRequest.current) return;
      setPending({ id, agent: target });
    } catch (e) {
      if (request !== loadRequest.current) return;
      if (e instanceof ApiError && e.status === 401) requirePairing();
      let message = e instanceof Error ? e.message : "Unable to send question.";
      if (e instanceof ApiError && e.status === 409) {
        message =
          "The incident changed. I refreshed the latest state; please review it and send your question again.";
        try {
          const next = await api.snapshot(snapshot.incidentId);
          if (request !== loadRequest.current || activeIncident.current !== next.incidentId) return;
          acceptSnapshot(next);
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
    const request = ++loadRequest.current;
    setConnecting(true);
    setError("");
    try {
      const health = await api.health();
      if (request !== loadRequest.current) return;
      setBackendMode(health.mode);
      await api.pair(token);
      if (request !== loadRequest.current) return;
      setPaired(true);
      setToken("");
      const list = await api.incidents();
      if (request !== loadRequest.current) return;
      setIncidents(list);
      if (!list.length) {
        setModal(health.mode === "fixture" ? "connect" : null);
        return;
      }
      const next = await api.snapshot(linkedIncidentId(list, window.location.search)!);
      if (request !== loadRequest.current) return;
      activateIncident(next);
    } catch (e) {
      if (request !== loadRequest.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "Connection failed. Check that the backend is running on port 4100.",
      );
    } finally {
      if (request === loadRequest.current) setConnecting(false);
    }
  }
  async function refreshIncidents() {
    const request = ++loadRequest.current;
    setConnecting(true);
    setError("");
    try {
      const health = await api.health();
      if (request !== loadRequest.current) return;
      setBackendMode(health.mode);
      const list = await api.incidents();
      if (request !== loadRequest.current) return;
      setPaired(true);
      setIncidents(list);
      if (list.length) {
        const id = list.some(i => i.incidentId === activeIncident.current) ? activeIncident.current! : linkedIncidentId(list, window.location.search)!;
        const next = await api.snapshot(id);
        if (request !== loadRequest.current) return;
        activateIncident(next);
      }
    } catch (e) {
      if (request !== loadRequest.current) return;
      if (e instanceof ApiError && e.status === 401) { requirePairing(); return; }
      setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      if (request === loadRequest.current) setConnecting(false);
    }
  }
  async function createFixture() {
    const request = ++loadRequest.current;
    setConnecting(true); setError("");
    try {
      const next = await api.createFixture();
      if (request !== loadRequest.current) return;
      const list = await api.incidents();
      if (request !== loadRequest.current) return;
      setIncidents(list); activateIncident(next);
    } catch (e) { if (request === loadRequest.current) setError(e instanceof Error ? e.message : "Could not create a fixture incident."); }
    finally { if (request === loadRequest.current) setConnecting(false); }
  }
  async function changeIncident(id: string) {
    if (pending || sendLock.current || connecting) return;
    const request = ++loadRequest.current;
    setLoadingIncident(true);
    try {
      const next = await api.snapshot(id);
      if (request !== loadRequest.current) return;
      activateIncident(next);
      const url = new URL(window.location.href);
      url.searchParams.set("incidentId", id);
      window.history.replaceState(null, "", url);
    } catch (e) {
      if (request !== loadRequest.current) return;
      if (e instanceof ApiError && e.status === 401) { requirePairing(); return; }
      setError(e instanceof Error ? e.message : "Unable to load incident.");
    } finally { if (request === loadRequest.current) setLoadingIncident(false); }
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
  if (paired && backendMode === "live" && incidents.length === 0 && modal !== "connect") {
    return <WaitingOffice reduced={reduced} onIncident={receiveFirstIncident} onAuthRequired={requirePairing} onConnect={openConnection} />;
  }
  const agentChats = chats.filter((c) => c.agent === selected);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#response-panel">Skip to response panel</a>
      <header className="topbar">
        <a className="brand" href="/" aria-label={`${PROJECT_NAME} home`}>
          <span className="brand-mark">
            <Hexagon size={27} />
            <Plus size={13} />
          </span>
          <span className="brand-name">{PROJECT_NAME}</span>
          <span className="brand-divider" />
          <span className="brand-caption">INCIDENT RESPONSE, TOGETHER</span>
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
          <ThemeToggle />
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
            className={`rail-button ${tab === "chat" ? "active" : ""}`}
            aria-label="Office overview"
            title="Office overview"
            aria-pressed={tab === "chat"}
            onClick={() => {
              setSelected("commander");
              setReset((n) => n + 1);
              setTab("chat");
              setMobileScene(true);
            }}
          >
            <Layers3 size={21} />
            <span>Overview</span>
          </button>
          <button
            className={`rail-button ${tab === "tasks" ? "current" : ""}`}
            aria-label="Incident tasks"
            title="Incident tasks"
            aria-pressed={tab === "tasks"}
            onClick={() => showPanel("tasks")}
          >
            <ListTodo size={21} />
            <span>Tasks</span>
            {blockers.length > 0 && <i />}
          </button>
          <button
            className={`rail-button ${tab === "activity" ? "current" : ""}`}
            aria-label="Incident timeline"
            title="Incident timeline"
            aria-pressed={tab === "activity"}
            onClick={() => showPanel("activity")}
          >
            <AudioLines size={21} />
            <span>Timeline</span>
          </button>
          <button className={`rail-button ${tab === "office" ? "current" : ""}`} aria-label="Office reference database" title="Office reference database" aria-pressed={tab === "office"} onClick={() => showPanel("office")}><BookOpen size={21} /><span>Directory</span></button>
          <span className="rail-line" />
          <span className="rail-section-label">TEAM</span>
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
              aria-pressed={selected === id}
              title={departments[id].name}
              onClick={() => select(id)}
            >
              <DeptIcon id={id} />
            </button>
          ))}
          <button
            className="rail-button rail-bottom"
            aria-label="Connect backend"
            title="Workspace settings"
            onClick={() => setModal("connect")}
          >
            <Settings2 size={20} />
            <span>Settings</span>
          </button>
        </nav>
        <main
          className={`office ${mobileScene ? "mobile-visible" : ""} ${roomFocus ? "room-focus" : ""}`}
        >
          <button className="mobile-office-close" onClick={() => setMobileScene(false)}><X size={15} /> Back to team</button>
          <div className="office-heading">
            <div className="breadcrumb">
              <span className="workspace-dot" /> YOUR WORKSPACE <ChevronRight size={12} /> COMMAND CENTER
            </div>
            <div className="office-title">
              <h1>Clarity when it matters.</h1>
              <button className="guide-button" onClick={() => setModal("help")}><CircleHelp size={15} /> How it works</button>
            </div>
            <p>One Slack incident. Five AI teammates. A clear next step for everyone.</p>
          </div>
          <div className="incident-strip">
            <span className="incident-indicator">
              <Radio size={17} />
            </span>
            <div className="incident-details">
              <div className="incident-meta">
                <span className="incident-state">{snapshot.status === "handed_over" ? "Handoff accepted" : snapshot.status === "closed" ? "Closed" : snapshot.status === "reported" ? "Report received" : "Incident in progress"}</span>
                <span>{snapshot.incidentId}</span>
              </div>
              {live && incidents.length > 1 ? (
                <select
                  aria-label="Select incident"
                  disabled={!!pending || sending || connecting}
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
                Shared thread <ExternalLink size={13} />
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
          <section className="overview-metrics" aria-label="Incident at a glance">
            <button className="overview-metric" onClick={() => showPanel("tasks")}>
              <span className="metric-icon"><ListTodo size={18} /></span>
              <span><strong>{openTasks.length}</strong><span>Open tasks</span></span>
              <ArrowRight size={14} />
            </button>
            <button className={`overview-metric ${blockers.length ? "attention" : ""}`} onClick={() => showPanel("tasks")}>
              <span className="metric-icon"><ShieldCheck size={18} /></span>
              <span><strong>{blockers.length}</strong><span>Need review</span></span>
              <ArrowRight size={14} />
            </button>
            <button className="overview-metric" onClick={() => showPanel("activity")}>
              <span className="metric-icon"><Users size={18} /></span>
              <span><strong>{working}<small> / {snapshot.agents.length}</small></strong><span>Agents working</span></span>
              <ArrowRight size={14} />
            </button>
          </section>
          {snapshot.slackThreadUrl && <button className="join-incident-banner" onClick={() => setModal("share")}><Users size={16} /><strong>Join this incident</strong><span>Share thread & QR · Add details together</span><ArrowRight size={16} /></button>}
          {live && <ResponseBoard snapshot={snapshot} />}
          <div className="scene-area">
            <div className="scene-caption">
              <span className="scene-caption-icon"><Layers3 size={15} /></span>
              <div><strong>Your team, in sync</strong><span>Select a desk · drag to explore the office</span></div>
            </div>
            <span className="scene-mode">
              <i />
              <span>{live ? "Connected office" : "Interactive preview"}</span>
              <b>{working} active</b>
            </span>
            {handoff && (
              <div
                key={`${handoff.from}-${handoff.to}-${handoff.taskId}`}
                className="flow-receipt"
                role="status"
                aria-live="polite"
                style={
                  {
                    "--flow-from": departments[handoff.from].color,
                    "--flow-to": departments[handoff.to].color,
                  } as React.CSSProperties
                }
              >
                <span className="flow-route-symbol" aria-hidden="true">
                  <i />
                  <ArrowRight size={12} />
                  <i />
                </span>
                <span>
                  <small>{live ? "LATEST LIVE ROUTE" : "SIMULATED ROUTE"}</small>
                  <strong>
                    <span>{departments[handoff.from].name}</span>
                    <ArrowRight size={10} />
                    <span>{departments[handoff.to].name}</span>
                  </strong>
                </span>
              </div>
            )}
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
              <span className="flow-legend">
                <i className="flow-dot" />
                Active flow
              </span>
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
                  setZoom(1.6);
                  setReset((v) => v + 1);
                  setSelected("commander");
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
          <div className="office-bottom">
            <div className={`team-pulse ${blockers.length ? "attention" : ""}`}>
              <span className="pulse-icon">
                <AudioLines size={19} />
              </span>
              <div>
                <strong>
                  {nextAction.title}
                </strong>
                <p>
                  {nextAction.description}
                </p>
              </div>
              <button
                onClick={() => { setTab(nextAction.panel); if (nextAction.panel === "chat") setSelected("commander"); setMobileScene(false); }}
              >
                {nextAction.action}
                <ArrowRight size={18} />
              </button>
            </div>
            {!live ? (
              <div className="demo-control">
                <div className="demo-heading">
                  <span>
                    <Sparkles size={15} /> TRY THE RESPONSE WORKFLOW
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
                <p className="demo-intro">Follow a forklift incident from first report to handoff. Pick a step or press play.</p>
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
                    loadRequest.current++;
                    activeIncident.current = null;
                    setLoadingIncident(false); setConnecting(false); setInput("");
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
        <aside className="inspector" id="response-panel" tabIndex={-1} aria-label="Response team panel">
          <div className="inspector-heading">
            <span><span className="workspace-dot" /> YOUR RESPONSE TEAM</span>
            <button
              className="mobile-toggle"
              onClick={() => setMobileScene((v) => !v)}
              aria-expanded={mobileScene}
            >
              <Layers3 size={15} />
              {mobileScene ? "Hide office" : "View office"}
            </button>
            <span className="team-count">
              0{agentIds.indexOf(selected) + 1} / 05
            </span>
          </div>
          <button className="mobile-incident-summary" onClick={() => setMobileScene(true)}>
            <span><span>{live ? "CURRENT INCIDENT" : "INTERACTIVE DEMO"} · {snapshot.incidentId}</span><strong>{snapshot.title}</strong></span>
            <ArrowRight size={16} />
          </button>
          <div
            className="agent-profile"
            style={
              {
                "--department": department.color,
                "--pale": department.pale,
              } as React.CSSProperties
            }
          >
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
              <h2>{department.name}</h2>
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
          <p className="agent-explanation">{agentExplanations[selected]}</p>
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
                  {id === "communications" ? "Comms" : id === "commander" ? "Lead" : departments[id].name}
                </span>
              </button>
            ))}
          </div>
          <div className="panel-tabs" role="tablist" aria-label="Agent panels">
            {panelIds.map((t, index) => (
              <button
                key={t}
                role="tab"
                id={`tab-${t}`}
                aria-controls={`panel-${t}`}
                aria-selected={tab === t}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === "ArrowRight") next = (index + 1) % panelIds.length;
                  else if (event.key === "ArrowLeft") next = (index + panelIds.length - 1) % panelIds.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = panelIds.length - 1;
                  else return;
                  event.preventDefault();
                  setTab(panelIds[next]);
                  document.getElementById(`tab-${panelIds[next]}`)?.focus();
                }}
              >
                {t === "chat" ? (
                  <MessageSquare size={14} />
                ) : t === "tasks" ? (
                  <ListTodo size={14} />
                ) : t === "thread" ? (
                  <Hash size={14} />
                ) : t === "office" ? (
                  <BookOpen size={14} />
                ) : (
                  <AudioLines size={14} />
                )}
                <span>
                  {panelNames[t]}
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
          <div className="panel-content" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === "office" ? <OfficeDirectory connected={live} /> : tab === "chat" ? (
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
                      style={{ "--department": department.color } as React.CSSProperties}
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
                          ? `${snapshot.agents.length - 1} specialists share the same incident. ${openTasks.filter(t => t.owner).length} open tasks have owners and ${blockers.length} need review.`
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
                          style={{ "--department": departments[t.agentId].color } as React.CSSProperties}
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
                    disabled={!!pending || sending || loadingIncident || connecting || (live && !paired)}
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
                  disabled={loadingIncident || connecting || (live && !paired)}
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
                    disabled={!input.trim() || !!pending || sending || loadingIncident || connecting || (live && !paired)}
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
                {live ? "Your questions and agent replies are shared in Slack." : "Safe to explore. This demo uses scripted responses."}
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
              autoFocus={modal !== "connect" || paired}
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            <span className="modal-emblem">
              {modal === "connect" ? <Wifi size={26} /> : <Layers3 size={26} />}
            </span>
            <h2 id="modal-title">
              {modal === "share" ? "Join the incident response" : modal === "connect"
                ? paired ? "Workspace connected" : "Connect your workspace"
                : "One incident. One shared picture."}
            </h2>
            {modal === "share" ? <IncidentShare snapshot={snapshot} /> : modal === "connect" ? (
              <>
                <p>
                  {paired
                    ? "Your browser is paired. You do not need to enter the token again."
                    : "Connect your workspace to receive agent activity, ask questions, and follow the incident’s Slack thread."}
                </p>
                {backendMode === "fixture" && <p className="field-hint">Offline backend: persisted fixture workflow only. Slack delivery and model inference are disabled until live mode is configured.</p>}
                {paired && !incidents.length && (
                  <div className="connection-status" role="status">
                    <strong>{backendMode === "fixture" ? "Ready for an offline rehearsal" : "Waiting for your first Slack incident"}</strong>
                    <p>{backendMode === "fixture"
                      ? "Create a rehearsal below to see persisted agent activity in the office."
                      : "Mention the bot in your configured Slack channel with a clearly labelled synthetic incident. Then refresh incidents here to load the live office."}</p>
                    <p>The office behind this window is still the scripted preview.</p>
                  </div>
                )}
                {!paired && <form
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
                    Enter DASHBOARD_TOKEN from your private .env file. Pairing is saved for this browser session.
                  </span>
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
                </form>}
                {error && <div role="alert" className="modal-error">{error}</div>}
                <button
                  className="text-button"
                  disabled={connecting || loadingIncident || !!pending || sending}
                  onClick={() => void refreshIncidents()}
                >
                  {paired ? "Refresh incidents" : "Already paired? Refresh incidents"} <RotateCcw size={13} />
                </button>
                {paired && backendMode === "fixture" && <button className="primary-button" disabled={connecting} onClick={() => void createFixture()}>Create offline rehearsal</button>}
              </>
            ) : (
              <>
                <p>SafeSlackForce turns an incident reported in Slack into a shared plan. AI agents organize the information; people carry out and confirm the real-world work.</p>
                <ol className="how-it-works">
                  <li><span>01</span><div><strong>Report it in Slack</strong><p>Mention the bot in your connected channel. The incident and its updates appear here.</p></div></li>
                  <li><span>02</span><div><strong>Let the team connect the dots</strong><p>The Commander brings together procedures, evidence, people, and a record of every action.</p></div></li>
                  <li><span>03</span><div><strong>Review, respond, and hand over</strong><p>Check tasks, clarify details in the shared Slack thread, and download the handoff report.</p></div></li>
                </ol>
                <div className="guide-tip"><Sparkles size={17} /><p><strong>New here? Start with the demo.</strong> Pick a workflow step, select an agent, or ask “What happens next?” to see how it works.</p></div>
                <p className="field-hint">
                  The demo is simulated. A connected workspace uses your configured services. Handoff acceptance does not mean all physical work is complete.
                </p>
                <button
                  className="primary-button"
                  onClick={() => { setModal(null); setMobileScene(true); }}
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
