/** High-level system design, drawn inline so it stays sharp in the deck and on narrow screens. */
type Box = { x: number; y: number; w: number; h: number; title: string; sub?: string; tone: "slack" | "api" | "ai" | "store" | "web" | "human" };
const BOXES: Box[] = [
  { x: 20, y: 40, w: 170, h: 64, title: "Reporter", sub: "@mention in channel", tone: "human" },
  { x: 20, y: 150, w: 170, h: 64, title: "Responders", sub: "Acknowledge · Review · Confirm", tone: "human" },
  { x: 20, y: 300, w: 170, h: 64, title: "Person on site", sub: "Emergency call agent", tone: "human" },
  { x: 250, y: 90, w: 170, h: 80, title: "Slack thread", sub: "System of record", tone: "slack" },
  { x: 480, y: 40, w: 190, h: 60, title: "Slack Bolt · Socket Mode", sub: "Intake + de-duplication", tone: "api" },
  { x: 480, y: 130, w: 190, h: 70, title: "Incident domain", sub: "Versioned state · roles", tone: "api" },
  { x: 480, y: 220, w: 190, h: 80, title: "Notification +\nresponse pumps", sub: "Backup chase · alerts\nScheduled updates", tone: "api" },
  { x: 480, y: 320, w: 190, h: 60, title: "Express API", sub: "Paired session · SSE", tone: "api" },
  { x: 730, y: 40, w: 220, h: 70, title: "Commander + 4 specialists", sub: "Per-agent tool allowlists", tone: "ai" },
  { x: 730, y: 140, w: 220, h: 56, title: "OpenRouter · Exa", sub: "Spend reserved before each call", tone: "ai" },
  { x: 730, y: 226, w: 220, h: 56, title: "SQLite", sub: "Entities + append-only event log", tone: "store" },
  { x: 730, y: 312, w: 220, h: 76, title: "Dashboard", sub: "3D office · Autopilot · CopilotKit", tone: "web" },
];
const LINES: [number, number, number, number, string?][] = [
  [190, 72, 250, 120], [190, 182, 250, 150], [420, 120, 480, 70, "events"], [575, 100, 575, 130],
  [670, 150, 730, 80, "tool calls"], [840, 110, 840, 140], [670, 175, 730, 254, "commit"], [575, 200, 575, 220],
  [480, 255, 420, 150, "notify"], [575, 300, 575, 320], [670, 350, 730, 350, "SSE"], [190, 332, 480, 350, "reviewed call record"],
];
export default function ArchitectureDiagram() {
  return (
    <div className="arch-wrap">
      <svg className="arch-svg" viewBox="0 0 970 400" role="img" aria-label="SafeSlackForce architecture: people report and confirm in a Slack thread; a Socket Mode intake feeds a versioned incident domain; a Commander and four specialist agents call scoped tools through OpenRouter and Exa; state is stored in SQLite with an event log; a notification pump escalates to backups; the Express API streams live updates to the 3D dashboard and CopilotKit copilot.">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="arch-arrow" /></marker>
        </defs>
        {LINES.map(([x1, y1, x2, y2, label], i) => (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="arch-line" markerEnd="url(#arrow)" />
            {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} className="arch-label" textAnchor="middle">{label}</text>}
          </g>
        ))}
        {BOXES.map(b => {
          const titles = b.title.split("\n");
          const subtitles = b.sub?.split("\n") ?? [];
          const extraHeight = (titles.length - 1) * 17 + Math.max(0, subtitles.length - 1) * 14;
          const titleY = b.y + b.h / 2 - (b.sub ? 4 : -5) - extraHeight / 2;
          return (
          <g key={b.title} className={`arch-box tone-${b.tone}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} />
            <text textAnchor="middle" className="arch-title">
              {titles.map((line, i) => <tspan key={i} x={b.x + b.w / 2} y={titleY + i * 17}>{line}</tspan>)}
            </text>
            {b.sub && <text textAnchor="middle" className="arch-sub">
              {subtitles.map((line, i) => <tspan key={i} x={b.x + b.w / 2} y={titleY + (titles.length - 1) * 17 + 18 + i * 14}>{line}</tspan>)}
            </text>}
          </g>
        ); })}
      </svg>
      <ul className="arch-legend">
        <li><i className="tone-human" />People</li><li><i className="tone-slack" />Slack</li><li><i className="tone-api" />API process</li>
        <li><i className="tone-ai" />Agents and providers</li><li><i className="tone-store" />Storage</li><li><i className="tone-web" />Browser</li>
      </ul>
    </div>
  );
}
