import { z } from 'zod';

export const agentIdSchema = z.enum(['commander', 'procedure', 'evidence', 'communications', 'records']);
export type AgentId = z.infer<typeof agentIdSchema>;
export const agentIds = agentIdSchema.options;
export const agentStatusSchema = z.enum(['idle', 'working', 'waiting', 'blocked', 'failed', 'done']);
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export const taskStatusSchema = z.enum(['proposed', 'assigned', 'acknowledged', 'in_progress', 'completed', 'blocked', 'needs_review', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const incidentStatusSchema = z.enum(['reported', 'coordinating', 'handoff_ready', 'handed_over', 'closed']);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;
export const sourceRefSchema = z.object({
  id: z.string(), label: z.string(),
  kind: z.enum(['slack_message', 'procedure', 'tool_result', 'human_confirmation']), url: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;
export const agentViewSchema = z.object({
  id: agentIdSchema, name: z.string(), status: agentStatusSchema,
  currentTaskId: z.string().nullable(), summary: z.string(), waitingOn: z.string().nullable(), sources: z.array(sourceRefSchema),
});
export type AgentView = z.infer<typeof agentViewSchema>;
export const taskViewSchema = z.object({
  id: z.string(), title: z.string(), agentId: agentIdSchema,
  owner: z.object({ slackUserId: z.string(), name: z.string() }).nullable(),
  status: taskStatusSchema, version: z.number().int(), blockedReason: z.string().nullable(),
  sources: z.array(sourceRefSchema), slackActionUrl: z.string().nullable(),
});
export type TaskView = z.infer<typeof taskViewSchema>;
export const responseActionSchema = z.object({
  id: z.string(), kind: z.enum(['management', 'followup', 'emergency_call']), title: z.string(),
  status: z.enum(['scheduled', 'running', 'completed', 'simulated', 'blocked', 'uncertain', 'cancelled']),
  summary: z.string(), dueAt: z.string().nullable(), receipt: z.string().nullable(),
  updatedAt: z.string(), sources: z.array(sourceRefSchema),
});
export type ResponseAction = z.infer<typeof responseActionSchema>;
export const snapshotSchema = z.object({
  schemaVersion: z.literal(1), incidentId: z.string(), version: z.number().int(), cursor: z.number().int(),
  mode: z.enum(['live', 'fixture']), title: z.string(), location: z.string(), status: incidentStatusSchema,
  slackThreadUrl: z.string(), slackConnection: z.enum(['connected', 'reconnecting', 'disconnected']),
  agents: z.array(agentViewSchema), tasks: z.array(taskViewSchema),
  responseActions: z.array(responseActionSchema).optional(),
  activity: z.array(z.object({ id: z.string(), text: z.string(), timestamp: z.string(), sources: z.array(sourceRefSchema) })),
  reports: z.array(z.object({ id: z.string(), version: z.number(), title: z.string(), downloadUrl: z.string() })),
});
export type IncidentSnapshot = z.infer<typeof snapshotSchema>;
export type StreamUpdate = {
  eventId: string; cursor: number; kind: 'snapshot.updated';
  handoff?: { from: AgentId; to: AgentId; taskId: string }; snapshot: IncidentSnapshot;
};
export const questionSchema = z.object({
  requestId: z.string().min(8).max(100), text: z.string().trim().min(1).max(4000), expectedVersion: z.number().int().nonnegative(),
});
export type QuestionResult = { requestId: string; status: 'pending' | 'done' | 'failed'; answer?: string; error?: string; sources?: SourceRef[] };
const readinessGateSchema = z.object({
  state: z.enum(['pending', 'done']), requirement: z.string(),
  blockers: z.array(z.object({ code: z.string(), message: z.string(), taskIds: z.array(z.string()) })),
});
export const readinessSchema = z.object({
  incidentId: z.string(), version: z.number().int(),
  handoff: readinessGateSchema, closure: readinessGateSchema,
  tasks: z.array(z.object({
    taskId: z.string(), title: z.string(), status: taskStatusSchema, owner: z.string().nullable(),
    explanation: z.string(), sources: z.array(sourceRefSchema),
    notifications: z.array(z.object({
      id: z.string(), recipient: z.string(), state: z.enum(['pending', 'sending', 'sent', 'failed', 'uncertain']),
      acknowledgedBy: z.string().nullable(), receipt: z.string().nullable(),
    })),
  })),
});
export type IncidentReadiness = z.infer<typeof readinessSchema>;
