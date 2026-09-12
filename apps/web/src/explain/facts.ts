/**
 * Numbers shown on the System design and Presentation pages. Every value is read off the build,
 * not rounded up for the stage. Update these when the code changes.
 */
export const FACTS = {
  agents: 5,
  tools: 15, // specs in apps/api/src/agents.ts
  backendTests: 64,
  frontendTests: 23,
  deliveryAttempts: 3, // notifications.ts retry cap
  followupDefaultSeconds: 300, // FOLLOWUP_SECONDS default
  callQuestions: 4, // EmergencyCall.tsx
  sessionDays: 7, // http.ts SESSION_MS
  autoReportAttempts: 4, // autopilot.ts limit
};

export const AGENTS = [
  { id: "commander", name: "Commander", job: "Reads the report, records location and facts, delegates, asks humans for missing facts", tools: ["read_incident", "read_procedure", "read_office", "update_location", "record_fact", "delegate", "ask_human", "manage_response"] },
  { id: "procedure", name: "Procedure", job: "Applies the approved procedure only when the report fits its scope; creates human-owned tasks", tools: ["read_incident", "read_procedure", "read_office", "apply_procedure", "flag_contradiction", "ask_human"] },
  { id: "evidence", name: "Evidence", job: "Saves a sourced evidence review, flags real contradictions, describes photos as unverified", tools: ["read_incident", "record_fact", "save_evidence_review", "flag_contradiction", "ask_human", "inspect_image"] },
  { id: "communications", name: "Communications", job: "Notifies the configured roster about open tasks, without duplicates", tools: ["read_incident", "read_procedure", "read_office", "notify", "manage_response"] },
  { id: "records", name: "Records", job: "Reads the whole timeline and saves a sourced Markdown handoff report", tools: ["read_incident", "read_history", "read_office", "save_report"] },
];
