import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotSchema, agentIds } from "@safeslackforce/contracts";
import { demoSnapshot, demoAnswer } from "../data";
import { api, ApiError, linkedIncidentId, safeUrl } from "../api";
afterEach(() => vi.unstubAllGlobals());
describe("frontend contract", () => {
  it("opens the incident named by a Slack link instead of the first incident", () => {
    const list = [{ incidentId: "INC-OLD" }, { incidentId: "INC-NEW" }];
    expect(linkedIncidentId(list, "?incidentId=INC-NEW")).toBe("INC-NEW");
    expect(linkedIncidentId(list, "")).toBe("INC-OLD");
    expect(linkedIncidentId([], "?incidentId=INC-NEW")).toBeUndefined();
  });
  it("relays only an explicitly confirmed transcript with version and idempotency key", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "pending" })));
    vi.stubGlobal("fetch", fetch);
    await api.transcript("INC-042", "Reviewed update", 9, "voice-request-1");
    expect(fetch.mock.calls[0][0]).toBe("/api/incidents/INC-042/transcripts");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ text: "Reviewed update", expectedVersion: 9, requestId: "voice-request-1", confirmed: true });
  });
  it("creates a clearly labelled persisted rehearsal only via the fixture endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(demoSnapshot(1))));
    vi.stubGlobal("fetch", fetch);
    expect((await api.createFixture()).mode).toBe("fixture");
    expect(fetch.mock.calls[0][0]).toBe("/api/demo/incidents");
    expect(JSON.parse(fetch.mock.calls[0][1].body).text).toContain("SYNTHETIC REHEARSAL");
  });
  it("validates every demo stage against Om’s canonical runtime schema", () => {
    for (let step = 0; step < 5; step++) {
      const s = snapshotSchema.parse(demoSnapshot(step));
      expect(s.agents.map((a) => a.id)).toEqual(agentIds);
      expect(s.mode).toBe("fixture");
      expect(s.slackConnection).toBe("disconnected");
      expect(s.tasks.every((t) => t.owner)).toBe(true);
    }
  });
  it("keeps human work open after handoff and surfaces evidence review before it", () => {
    expect(
      demoSnapshot(3).tasks.filter((t) => t.status === "needs_review"),
    ).toHaveLength(1);
    const handoff = demoSnapshot(4);
    expect(handoff.status).toBe("handed_over");
    expect(handoff.tasks.find((t) => t.id === "help")?.status).toBe("assigned");
    expect(handoff.reports).toHaveLength(1);
    expect(demoAnswer("commander", "What happens next?", handoff)).toContain(
      "does not close",
    );
  });
  it("sends the version and idempotency key, with cookie credentials and no client actor", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ requestId: "request-123" }), {
        status: 202,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await api.ask("INC-042", "commander", "Who owns this?", 7, "request-123");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/incidents/INC-042/agents/commander/questions");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      text: "Who owns this?",
      expectedVersion: 7,
      requestId: "request-123",
    });
  });
  it("preserves stale-version failures for the UI to refresh instead of silently replaying", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Incident changed" }), {
          status: 409,
        }),
      ),
    );
    await expect(
      api.ask("INC-042", "evidence", "Why blocked?", 2, "request-123"),
    ).rejects.toEqual(new ApiError(409, "Incident changed"));
  });
  it("rejects malformed snapshot responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...demoSnapshot(1),
            agents: [{ id: "invented" }],
          }),
        ),
      ),
    );
    await expect(api.snapshot("INC-042")).rejects.toThrow();
  });
  it("replays newer snapshots, ignores duplicates, validates handoffs and closes on cleanup", () => {
    class FakeStream {
      static last: FakeStream;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      listeners = new Map<string, (e: unknown) => void>();
      close = vi.fn();
      constructor(
        public url: string,
        public opts: unknown,
      ) {
        FakeStream.last = this;
      }
      addEventListener(k: string, fn: (e: unknown) => void) {
        this.listeners.set(k, fn);
      }
      emit(data: unknown) {
        this.listeners.get("snapshot.updated")?.({
          data: JSON.stringify(data),
        });
      }
    }
    vi.stubGlobal("EventSource", FakeStream);
    const update = vi.fn(),
      state = vi.fn(),
      error = vi.fn();
    const close = api.stream("INC-042", 1, update, state, error);
    const stream = FakeStream.last;
    expect(stream.opts).toEqual({ withCredentials: true });
    expect(stream.url).toContain("after=1");
    stream.onopen?.();
    expect(state).toHaveBeenCalledWith("connected");
    const snapshot = demoSnapshot(1);
    const event = {
      eventId: "INC-042:2",
      kind: "snapshot.updated",
      cursor: 2,
      snapshot,
    };
    stream.emit(event);
    stream.emit(event);
    expect(update).toHaveBeenCalledTimes(1);
    stream.emit({
      ...event,
      cursor: 3,
      snapshot: { ...snapshot, cursor: 3, incidentId: "OTHER" },
    });
    expect(error).toHaveBeenCalledTimes(1);
    stream.emit({
      ...event,
      cursor: 3,
      snapshot: { ...snapshot, cursor: 3 },
      handoff: { from: "malformed", to: "records", taskId: "x" },
    });
    expect(error).toHaveBeenCalledTimes(2);
    stream.onerror?.();
    expect(state).toHaveBeenCalledWith("reconnecting");
    close();
    expect(stream.close).toHaveBeenCalledOnce();
  });
  it("rejects executable source URLs", () => {
    vi.stubGlobal("location", { origin: "http://localhost:5173" });
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("/api/report")).toBe("http://localhost:5173/api/report");
  });
  it("loads Slack source messages through the authorized API with cancellation", async () => {
    const message = {
      id: "m1",
      text: "Witness update",
      author: "ULEAD",
      timestamp: "2026-09-12T14:00:00Z",
      source: { id: "m1", label: "Witness report", kind: "slack_message" },
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ messages: [message] })));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect((await api.details("INC-042", controller.signal)).messages).toEqual([
      message,
    ]);
    expect(fetch.mock.calls[0][0]).toBe("/api/incidents/INC-042/details");
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
  it("rejects malformed Slack message sources before rendering", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              messages: [
                {
                  id: "m",
                  text: "update",
                  author: "a",
                  timestamp: "2026-09-12",
                  source: { kind: "unknown" },
                },
              ],
            }),
          ),
        ),
    );
    await expect(api.details("INC-042")).rejects.toThrow();
  });
});
