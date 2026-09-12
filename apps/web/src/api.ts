import { z } from "zod";
import {
  agentIdSchema,
  readinessSchema,
  snapshotSchema,
  sourceRefSchema,
  type AgentId,
  type IncidentSnapshot,
  type QuestionResult,
  type StreamUpdate,
} from "@incidentos/contracts";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body.error || `Request failed (${r.status})`);
  }
  return r.json();
}
export const api = {
  readiness: async (id: string, signal?: AbortSignal) => readinessSchema.parse(await request(`/api/incidents/${encodeURIComponent(id)}/readiness`, { signal })),
  transcript: (id: string, text: string, expectedVersion: number, requestId: string) =>
    request(`/api/incidents/${encodeURIComponent(id)}/transcripts`, { method: "POST", body: JSON.stringify({ text, expectedVersion, requestId, confirmed: true }) }),
  transcriptStatus: (requestId: string) => request<{ status: string; error?: string }>(`/api/transcripts/${encodeURIComponent(requestId)}`),
  health: () => request<{ ok: boolean; mode: "fixture" | "live"; slack: string; modelConfigured: boolean }>("/health"),
  createFixture: async () => snapshotSchema.parse(await request("/api/demo/incidents", {
    method: "POST",
    body: JSON.stringify({ text: "SYNTHETIC REHEARSAL: Forklift incident at Loading Dock B. One person is reported injured. Site lead acknowledgement is outstanding." }),
  })),
  pair: (token: string) =>
    request("/api/session", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  details: async (id: string, signal?: AbortSignal) =>
    z
      .object({
        attachments: z.array(z.object({ id: z.string(), name: z.string(), mimetype: z.string(), size: z.number(), removed: z.boolean().optional(), observation: z.string().optional(), source: sourceRefSchema })).default([]),
        messages: z.array(
          z.object({
            id: z.string(),
            text: z.string(),
            author: z.string(),
            timestamp: z.string(),
            deleted: z.boolean().optional(),
            source: sourceRefSchema,
          }),
        ),
      })
      .parse(
        await request(`/api/incidents/${encodeURIComponent(id)}/details`, {
          signal,
        }),
      ),
  incidents: () =>
    request<{ incidentId: string; title: string; status: string }[]>(
      "/api/incidents",
    ),
  snapshot: async (id: string): Promise<IncidentSnapshot> =>
    snapshotSchema.parse(
      await request(`/api/incidents/${encodeURIComponent(id)}`),
    ),
  ask: (
    id: string,
    agent: AgentId,
    text: string,
    expectedVersion: number,
    requestId: string,
  ) =>
    request(
      `/api/incidents/${encodeURIComponent(id)}/agents/${agent}/questions`,
      {
        method: "POST",
        body: JSON.stringify({ text, expectedVersion, requestId }),
      },
    ),
  answer: (id: string) =>
    request<QuestionResult>(`/api/requests/${encodeURIComponent(id)}`),
  stream(
    id: string,
    after: number,
    onUpdate: (event: StreamUpdate) => void,
    onState: (state: "connected" | "reconnecting") => void,
    onError: (message: string) => void,
  ) {
    const stream = new EventSource(
      `/api/incidents/${encodeURIComponent(id)}/events?after=${after}`,
      { withCredentials: true },
    );
    let cursor = after;
    stream.onopen = () => onState("connected");
    stream.onerror = () => onState("reconnecting");
    stream.addEventListener("snapshot.updated", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data);
        const snapshot = snapshotSchema.parse(raw.snapshot);
        if (
          raw.kind !== "snapshot.updated" ||
          typeof raw.eventId !== "string" ||
          raw.snapshot.incidentId !== id ||
          !Number.isInteger(raw.cursor) ||
          raw.cursor !== snapshot.cursor
        )
          throw new Error("Invalid event");
        if (
          raw.handoff &&
          (!agentIdSchema.safeParse(raw.handoff.from).success ||
            !agentIdSchema.safeParse(raw.handoff.to).success ||
            typeof raw.handoff.taskId !== "string")
        )
          throw new Error("Invalid handoff");
        if (raw.cursor <= cursor) return;
        cursor = raw.cursor;
        onUpdate({ ...raw, snapshot });
      } catch {
        onError(
          "An invalid update was received. Refresh the incident to recover.",
        );
      }
    });
    return () => stream.close();
  },
};
export function safeUrl(url: string) {
  try {
    const u = new URL(url, location.origin);
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
