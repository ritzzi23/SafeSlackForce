import {
  agentIds,
  type AgentId,
  type IncidentSnapshot,
  type AgentStatus,
} from "@incidentos/contracts";
export const departments: Record<
  AgentId,
  { name: string; role: string; color: string; pale: string; code: string }
> = {
  commander: {
    name: "Commander",
    role: "Your incident coordinator",
    color: "#56634c",
    pale: "#e9eddf",
    code: "CO",
  },
  procedure: {
    name: "Procedure",
    role: "Protocols & next steps",
    color: "#3d8b83",
    pale: "#e4f0eb",
    code: "PR",
  },
  evidence: {
    name: "Evidence",
    role: "Facts & verification",
    color: "#5f85b1",
    pale: "#e9eff7",
    code: "EV",
  },
  communications: {
    name: "Communications",
    role: "People & acknowledgements",
    color: "#be8b44",
    pale: "#f6eddb",
    code: "CM",
  },
  records: {
    name: "Records",
    role: "Timeline & handoff",
    color: "#9580af",
    pale: "#efe9f5",
    code: "RE",
  },
};
export const stages = [
  "Report received",
  "Team mobilized",
  "Awaiting response",
  "Conflicting evidence",
  "Handoff accepted",
];
export function demoSnapshot(step: number): IncidentSnapshot {
  const summaries = [
    [
      "A new report has arrived. Ready to coordinate.",
      "Ready to find the relevant procedure.",
      "Waiting for witness updates.",
      "Standing by for assigned responders.",
      "Ready to document this incident.",
    ],
    [
      "I’ve delegated the procedure check, evidence review, and responder notification.",
      "Retrieving the Dock B procedure and assigning owners.",
      "Reviewing the initial witness account.",
      "Notifying the designated incident lead.",
      "Building the incident timeline.",
    ],
    [
      "The team has three owned tasks. We’re waiting for Ritesh to acknowledge.",
      "Three procedure tasks assigned to the incident lead.",
      "Initial report linked. No second witness update yet.",
      "Notification delivered. Waiting for Ritesh’s acknowledgement.",
      "Timeline is up to date; handoff is not yet ready.",
    ],
    [
      "Two accounts disagree on the affected area. Evidence has flagged a review.",
      "Affected area confirmation needs human review.",
      "The initial report says the dock is clear. A witness reports the area is still occupied.",
      "Ritesh acknowledged coordination. Supervisor clarification requested.",
      "Preserving both witness accounts in the timeline.",
    ],
    [
      "The supervisor clarified the conflicting reports and accepted the handoff. Outstanding work remains assigned.",
      "Area confirmation reviewed by the supervisor.",
      "Contradiction resolved with an attributed human clarification.",
      "Handoff accepted. External contact confirmation remains with the lead.",
      "Sourced handoff report prepared for download.",
    ],
  ][step];
  const statuses: AgentStatus[][] = [
    ["idle", "idle", "idle", "idle", "idle"],
    ["working", "working", "working", "working", "working"],
    ["waiting", "done", "idle", "waiting", "working"],
    ["blocked", "blocked", "blocked", "done", "working"],
    ["done", "done", "done", "done", "done"],
  ];
  const src = {
    id: "demo-witness-1",
    kind: "slack_message" as const,
    label: "Demo witness report · Dock B",
  };
  const procedure = {
    id: "warehouse-coordination-v1",
    kind: "procedure" as const,
    label: "Synthetic warehouse procedure · v1",
  };
  const eventTexts = [
    "Forklift incident reported at Loading Dock B.",
    "Commander delegated to Procedure, Evidence, and Communications.",
    "Notification delivered to Ritesh. Acknowledgement pending.",
    "Witness accounts conflict. Area confirmation requires review.",
    "Supervisor clarified the report and accepted the handoff.",
  ];
  return {
    schemaVersion: 1,
    incidentId: "INC-042",
    version: step + 1,
    cursor: step + 1,
    mode: "fixture",
    title: "Forklift incident at Loading Dock B",
    location: "Loading Dock B",
    status:
      step === 0 ? "reported" : step === 4 ? "handed_over" : "coordinating",
    slackThreadUrl: "",
    slackConnection: "disconnected",
    agents: agentIds.map((id, index) => ({
      id,
      name: departments[id].name,
      status: statuses[step][index],
      currentTaskId: step ? `demo-${id}` : null,
      summary: summaries[index],
      waitingOn: ["waiting", "blocked"].includes(statuses[step][index])
        ? summaries[index]
        : null,
      sources: step ? [id === "procedure" ? procedure : src] : [],
    })),
    tasks: step
      ? [
          {
            id: "lead",
            title: "Accept incident coordination",
            agentId: "communications",
            owner: { slackUserId: "DEMO_RITESH", name: "Ritesh" },
            status: step >= 3 ? "acknowledged" : "assigned",
            version: step,
            blockedReason: null,
            sources: [procedure],
            slackActionUrl: null,
          },
          {
            id: "area",
            title: "Confirm affected area status",
            agentId: "evidence",
            owner: { slackUserId: "DEMO_OM", name: "Om" },
            status:
              step === 3
                ? "needs_review"
                : step === 4
                  ? "completed"
                  : "in_progress",
            version: step,
            blockedReason:
              step === 3
                ? "Two witness accounts disagree about occupancy."
                : null,
            sources: [src, procedure],
            slackActionUrl: null,
          },
          {
            id: "help",
            title: "Confirm external service contact",
            agentId: "procedure",
            owner: { slackUserId: "DEMO_RITESH", name: "Ritesh" },
            status: "assigned",
            version: step,
            blockedReason: null,
            sources: [procedure],
            slackActionUrl: null,
          },
        ]
      : [],
    activity: eventTexts
      .slice(0, step + 1)
      .map((text, i) => ({
        id: `demo-event-${i}`,
        text,
        timestamp: new Date(
          Date.UTC(2026, 8, 12, 14, 32, i * 12),
        ).toISOString(),
        sources: [src],
      })),
    reports:
      step === 4
        ? [
            {
              id: "demo-report",
              version: 1,
              title: "Dock B · Handoff report",
              downloadUrl: "",
            },
          ]
        : [],
  };
}
export function demoAnswer(
  agent: AgentId,
  question: string,
  snapshot: IncidentSnapshot,
) {
  const a = snapshot.agents.find((a) => a.id === agent)!;
  if (/who|owner|responsib/i.test(question))
    return "Ritesh owns incident coordination and external contact confirmation. Om owns the affected area review. These are fictional assignments for this demo.";
  if (/next|priorit/i.test(question))
    return snapshot.status === "handed_over"
      ? "The handoff is accepted. The lead still needs to explicitly confirm external service contact; a handoff does not close outstanding tasks."
      : "The next human action is to acknowledge ownership in Slack, then confirm the affected area status. If witness accounts conflict, the supervisor must clarify them.";
  if (/delegat|start|coordinate/i.test(question))
    return "In the live workflow, I ask Procedure to find the applicable protocol, Evidence to compare witness accounts, and Communications to notify the lead. Records maintains the handoff history. Use “Play demo” to see that sequence here.";
  return `${a.summary} ${agent === "commander" ? "Select any department to inspect its work. Human approvals happen in the incident’s Slack thread." : "My findings use the incident’s shared evidence and stay visible to the Commander."}`;
}
