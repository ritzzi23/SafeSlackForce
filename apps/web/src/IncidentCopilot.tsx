import { CopilotKit, useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { agentIds, type AgentId, type IncidentSnapshot } from "@safeslackforce/contracts";

type Tab = "chat" | "tasks" | "activity" | "thread" | "office" | "notifications";
type Props = {
  snapshot: IncidentSnapshot;
  onFocus: (agent: AgentId) => void;
  onTab: (tab: Tab) => void;
  onAsk: (agent: AgentId, question: string) => Promise<void>;
};

const INSTRUCTIONS = `You are the SafeSlackForce dashboard copilot for an incident coordinator.
Answer from the incident state you are given; say "unknown" when it is not there.
Facts are reported, not confirmed. Never claim a physical action happened unless a task is completed by a named person.
You can focus an agent desk, open a dashboard tab, or ask one of the five agents a question.
Asking an agent posts the question into the incident's Slack thread, so the coordinator must approve it first.
If anyone may be in immediate danger, tell them to call 911 first.`;

export function asCopilotContext(s: IncidentSnapshot) {
  return {
    incident: { id: s.incidentId, title: s.title, status: s.status, location: s.location, mode: s.mode, slack: s.slackConnection, version: s.version },
    agents: s.agents.map(a => ({ id: a.id, status: a.status, currentTaskId: a.currentTaskId, summary: a.summary, waitingOn: a.waitingOn })),
    tasks: s.tasks.map(t => ({ id: t.id, title: t.title, agent: t.agentId, status: t.status, owner: t.owner?.name ?? null, blockedReason: t.blockedReason })),
    recentActivity: s.activity.slice(-8).map(a => ({ at: a.timestamp, text: a.text })),
    reports: s.reports.map(r => ({ title: r.title, version: r.version })),
  };
}

function Copilot({ snapshot, onFocus, onTab, onAsk }: Props) {
  useCopilotReadable({ description: "Current SafeSlackForce incident: status, the five agents, and human-owned tasks", value: asCopilotContext(snapshot) });
  useCopilotAction({
    name: "focusAgentDesk",
    description: "Focus the 3D office camera and inspector on one agent desk.",
    parameters: [{ name: "agent", type: "string", enum: [...agentIds], required: true }],
    handler: async ({ agent }) => { onFocus(agent as AgentId); return `Focused ${agent}`; },
  });
  useCopilotAction({
    name: "openDashboardTab",
    description: "Open a dashboard panel: tasks, activity, thread (Slack messages and emergency call), notifications, or office directory.",
    parameters: [{ name: "tab", type: "string", enum: ["tasks", "activity", "thread", "notifications", "office"], required: true }],
    handler: async ({ tab }) => { onTab(tab as Tab); return `Opened ${tab}`; },
  });
  useCopilotAction({
    name: "askIncidentAgent",
    description: "Ask one SafeSlackForce agent a question. The question and the answer are posted in the incident Slack thread. Requires the coordinator's approval.",
    parameters: [
      { name: "agent", type: "string", enum: [...agentIds], required: true },
      { name: "question", type: "string", required: true },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      const agent = String(args.agent ?? "");
      if (status === "complete") return <div className="copilot-approval">Handled request for {agent}.</div>;
      return <div className="copilot-approval">
        <strong>Ask {agent || "an agent"}?</strong>
        <p>{args.question}</p>
        <p className="copilot-approval-note">{snapshot.mode === "live" ? "This posts in the incident Slack thread." : "Offline fixture: nothing is sent to Slack."}</p>
        <div className="copilot-approval-actions">
          <button type="button" className="primary-button" disabled={status !== "executing" || !agentIds.includes(agent as AgentId)} onClick={async () => {
            try { onFocus(agent as AgentId); await onAsk(agent as AgentId, String(args.question ?? "")); respond?.(`Question sent to ${agent}. The answer will appear in its chat panel and the Slack thread.`); }
            catch { respond?.("Sending failed. Tell the coordinator to check the activity panel."); }
          }}>Approve and send</button>
          <button type="button" className="text-button" disabled={status !== "executing"} onClick={() => respond?.("The coordinator declined. Nothing was sent.")}>Cancel</button>
        </div>
      </div>;
    },
  });
  return <CopilotPopup
    instructions={INSTRUCTIONS}
    labels={{ title: "Incident copilot", initial: "Ask about this incident: who owns what, what is blocked, or have an agent look into something." }}
  />;
}

export default function IncidentCopilot(props: Props) {
  return <CopilotKit runtimeUrl="/api/copilotkit"><Copilot {...props} /></CopilotKit>;
}
