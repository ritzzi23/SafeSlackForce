import { useEffect, useState } from "react";
import {
  ExternalLink,
  Hash,
  LoaderCircle,
  MessageSquare,
  Radio,
} from "lucide-react";
import type { IncidentSnapshot, SourceRef } from "@safeslackforce/contracts";
import { api, safeUrl } from "./api";
import VoiceUpdate from "./VoiceUpdate";
import EmergencyCall from "./EmergencyCall";
import { PROJECT_NAME, DEMO_CHANNEL } from "./branding";
type Message = {
  id: string;
  text: string;
  author: string;
  timestamp: string;
  deleted?: boolean;
  source: SourceRef;
};
export default function SlackThread({
  snapshot,
  connected,
  onConnect,
}: {
  snapshot: IncidentSnapshot;
  connected: boolean;
  onConnect: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Awaited<ReturnType<typeof api.details>>["attachments"]>([]);
  useEffect(() => { setMessages([]); setAttachments([]); }, [snapshot.incidentId]);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const t = setTimeout(() => {
      api
        .details(snapshot.incidentId, controller.signal)
        .then((data) => { if (!controller.signal.aborted) { setMessages(data.messages); setAttachments(data.attachments); } })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "Could not load source messages.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [connected, snapshot.incidentId, snapshot.version]);
  const step = snapshot.version - 1;
  const demo = [
    {
      name: "Om",
      initials: "OM",
      text: `@${PROJECT_NAME} Forklift incident at Loading Dock B. One person is reported injured.`,
      color: "#d9e4d6",
      time: "10:32",
    },
    ...(step >= 1
      ? [
          {
            name: "Commander",
            initials: "CO",
            text: "Incident opened. Procedure is checking the protocol, Evidence is collecting accounts, and Communications is notifying the lead.",
            color: "#e5e9d6",
            time: "10:32",
          },
        ]
      : []),
    ...(step >= 2
      ? [
          {
            name: "Communications",
            initials: "CM",
            text: "@Ritesh Please acknowledge incident coordination. The assigned tasks are ready for review.",
            color: "#f0e4c9",
            time: "10:33",
          },
        ]
      : []),
    ...(step >= 3
      ? [
          {
            name: "Ritesh",
            initials: "RO",
            text: "I’ve accepted coordination. A witness says the affected area is still occupied; this conflicts with the earlier report.",
            color: "#d9e4d6",
            time: "10:33",
          },
          {
            name: "Evidence",
            initials: "EV",
            text: "The affected area confirmation now needs review. Both accounts are preserved for supervisor clarification.",
            color: "#dee7f0",
            time: "10:34",
          },
        ]
      : []),
    ...(step >= 4
      ? [
          {
            name: "Om · supervisor",
            initials: "OM",
            text: "The accounts refer to different times. I’ve clarified the area status and accepted the handoff. External contact confirmation remains assigned.",
            color: "#d9e4d6",
            time: "10:35",
          },
        ]
      : []),
  ];
  return (
    <div className="slack-panel">
      <div className="slack-channel-heading">
        <span className="slack-hash">
          <Hash size={19} />
        </span>
        <div>
          <h3>{connected ? "Incident source thread" : DEMO_CHANNEL}</h3>
          <p>
            {connected ? snapshot.incidentId : "Synthetic Slack conversation"}
          </p>
        </div>
        <span className="slack-channel-status">
          <Radio size={11} />
          {connected ? snapshot.slackConnection : "Demo"}
        </span>
      </div>
      <div className="slack-channel-notice">
        <MessageSquare size={13} />
        <span>
          {connected
            ? snapshot.mode === "fixture"
              ? "Persisted synthetic source messages. No messages were sent to Slack in offline mode."
              : "Participant observations from the shared thread. Add details in Slack; agents process updates automatically."
            : "A preview of the incident conversation. These messages are scripted for the demo."}
        </span>
      </div>
      {loading && (
        <div className="slack-loading">
          <LoaderCircle size={13} className="spin" />
          Updating thread…
        </div>
      )}
      {error && (
        <p role="alert" className="modal-error">
          {error}
        </p>
      )}
      <div className="slack-messages">
        {connected
          ? messages.map((m) => (
              <article className="slack-message" key={m.source.id}>
                <span className="slack-person">
                  {m.author.replace(/^U/, "").slice(0, 2)}
                </span>
                <div>
                  <div className="slack-message-head">
                    <strong>{m.author}</strong>
                    <time>
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p>
                    {m.deleted
                      ? "Source message removed or superseded."
                      : m.text}
                  </p>
                  {m.source.url && safeUrl(m.source.url) && (
                    <a
                      className="source"
                      href={safeUrl(m.source.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View source <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </article>
            ))
          : demo.map((m, i) => (
              <article className="slack-message" key={i}>
                <span className="slack-person" style={{ background: m.color }}>
                  {m.initials}
                </span>
                <div>
                  <div className="slack-message-head">
                    <strong>{m.name}</strong>
                    {["CO", "CM", "EV"].includes(m.initials) && <b>APP</b>}
                    <time>{m.time}</time>
                  </div>
                  <p>{m.text}</p>
                  {i === 0 && (
                    <span className="slack-reply-count">
                      {demo.length - 1} thread replies
                    </span>
                  )}
                </div>
              </article>
            ))}
      </div>
      {connected && !loading && !messages.length && !error && (
        <p className="panel-intro">
          No source messages were returned for this incident.
        </p>
      )}
      {connected && attachments.length > 0 && <section className="voice-update" aria-label="Incident attachments">
        <h4>Evidence attachments</h4>
        {attachments.map(file => <div key={file.id}>
          <p>{file.name}{file.removed ? " — removed or superseded" : ""}</p>
          {!file.removed && <a className="source" href={`/api/incidents/${encodeURIComponent(snapshot.incidentId)}/attachments/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">Open protected image <ExternalLink size={12} /></a>}
          {file.observation && !file.removed && <p>{file.observation}</p>}
        </div>)}
        <p>Images and model observations do not confirm safety or completed actions.</p>
      </section>}
      {connected && <EmergencyCall key={`call-${snapshot.incidentId}`} snapshot={snapshot} />}
      {connected && <VoiceUpdate key={snapshot.incidentId} snapshot={snapshot} />}
      {snapshot.slackThreadUrl ? (
        <a
          className="slack-open-button"
          href={safeUrl(snapshot.slackThreadUrl)}
          target="_blank"
          rel="noreferrer"
        >
          Continue in Slack <ExternalLink size={13} />
        </a>
      ) : (
        <button className="slack-open-button" onClick={onConnect}>
          Connect your Slack workspace <ExternalLink size={13} />
        </button>
      )}
    </div>
  );
}
