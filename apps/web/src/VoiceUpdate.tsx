import { useEffect, useRef, useState } from "react";
import type { IncidentSnapshot } from "@incidentos/contracts";
import { api } from "./api";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export default function VoiceUpdate({ snapshot }: { snapshot: IncidentSnapshot }) {
  const [text, setText] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const speech = useRef<Recognition | null>(null);
  const dispatching = useRef(false);
  const Speech = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  useEffect(() => () => { if (speech.current) { speech.current.onend = null; speech.current.onresult = null; speech.current.onerror = null; speech.current.abort(); } }, []);
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await api.transcriptStatus(pending);
        if (stopped) return;
        if (result.status === "pending" && ++attempts < 120) { timer = setTimeout(poll, 1000); return; }
        setPending(null); dispatching.current = false;
        setMessage(result.status === "delivered"
          ? snapshot.mode === "live" ? "Update delivered to Slack. The Commander is processing it; follow progress in the activity panel." : "Update saved to the offline fixture. Nothing was sent to Slack."
          : result.status === "delivered_agent_failed" ? "Update was delivered, but agent processing failed. Inspect activity; do not resend it."
          : "Delivery is not confirmed. Inspect the thread and activity before submitting again.");
        setReviewed(false);
      } catch {
        if (!stopped) { setMessage("Cannot confirm delivery. Inspect the thread before resubmitting."); setPending(null); dispatching.current = false; setReviewed(false); }
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [pending, snapshot.mode]);
  function record() {
    if (!Speech) return;
    const recognition = new Speech();
    recognition.lang = "en-US"; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => { setText(Array.from(event.results).map(result => result[0].transcript).join(" ").slice(0, 4000)); setReviewed(false); };
    recognition.onerror = () => { setMessage("Microphone or speech recognition unavailable. Type your update instead."); setListening(false); };
    recognition.onend = () => setListening(false);
    speech.current = recognition;
    try { recognition.start(); setListening(true); setMessage(""); }
    catch { setMessage("Could not start speech recognition. Type your update instead."); }
  }
  async function send() {
    if (!reviewed || !text.trim() || dispatching.current) return;
    dispatching.current = true;
    const id = crypto.randomUUID();
    setMessage("Submitting reviewed update…"); setSubmitting(true);
    try { await api.transcript(snapshot.incidentId, text.trim(), snapshot.version, id); setPending(id); }
    catch (e) { setPending(null); dispatching.current = false; setReviewed(false); setMessage(e instanceof Error ? `${e.message}. Inspect the thread before resubmitting.` : "Unable to submit. Inspect the thread before retrying."); }
    finally { setSubmitting(false); }
  }
  return <section className="voice-update" aria-label="Reviewed incident update">
    <h4>Report an update</h4>
    <p>Speak or type, review the details, then submit. Browser speech may use an external provider; use synthetic data only.</p>
    {Speech && <button type="button" className="text-button" disabled={submitting || !!pending || snapshot.status === "closed"} onClick={() => listening ? speech.current?.stop() : record()}>{listening ? "Stop recording" : "Record voice update"}</button>}
    <textarea aria-label="Reviewed incident update text" placeholder="Type an update or review your transcript…" maxLength={4000} value={text} disabled={submitting || !!pending || snapshot.status === "closed"} onChange={e => { setText(e.target.value); setReviewed(false); }} />
    <label><input type="checkbox" checked={reviewed} disabled={submitting || !!pending || listening || !text.trim()} onChange={e => setReviewed(e.target.checked)} /> I reviewed names, location and numbers.</label>
    <button type="button" className="primary-button" disabled={!reviewed || submitting || !!pending || listening || snapshot.status === "closed"} onClick={() => void send()}>{submitting || pending ? "Submitting…" : snapshot.mode === "live" ? "Send reviewed update to Slack" : "Save reviewed fixture update"}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
