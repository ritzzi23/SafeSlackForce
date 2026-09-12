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

export const CALL_QUESTIONS = [
  { key: "what", label: "What happened", prompt: "What happened? Describe it in one or two sentences." },
  { key: "where", label: "Exact location", prompt: "Where exactly are you? Building, floor, or area." },
  { key: "injuries", label: "Injuries", prompt: "Is anyone hurt? How many people, and how badly?" },
  { key: "hazard", label: "Ongoing hazard", prompt: "Is the area safe now, or is there still a hazard?" },
] as const;
export type CallAnswers = Partial<Record<(typeof CALL_QUESTIONS)[number]["key"], string>>;

// Deterministic, not model-based: life-threatening words always trigger the 911 instruction,
// even if the model or network is unavailable.
const LIFE_THREAT = /\b(not breathing|unconscious|unresponsive|no pulse|cardiac|heart attack|seizure|choking|severe bleeding|bleeding heavily|trapped|fire|smoke|explosion|gun|weapon|shooting|stab|overdose|collapsed|electrocut\w*|gas leak)\b/i;
export function lifeThreat(text: string) { return LIFE_THREAT.exec(text)?.[0]; }

export function callRecord(answers: CallAnswers, threat?: string) {
  const lines = CALL_QUESTIONS.map(q => `${q.label}: ${answers[q.key]?.trim() || "not provided"}`);
  return [
    "[Emergency call agent: caller-reported, reviewed before relay]",
    ...lines,
    threat ? `Life-threat keyword detected ("${threat}"). Caller was told to call 911 immediately. This system does not dispatch emergency services.` : "No life-threat keyword detected. Caller was reminded to call 911 if that changes.",
  ].join("\n").slice(0, 4000);
}

type Phase = "idle" | "asking" | "review" | "sent";

export default function EmergencyCall({ snapshot }: { snapshot: IncidentSnapshot }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<CallAnswers>({});
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [record, setRecord] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const speech = useRef<Recognition | null>(null);
  const Speech = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
  const threat = Object.values(answers).map(a => lifeThreat(a ?? "")).find(Boolean) ?? lifeThreat(draft);
  const closed = snapshot.status === "closed";

  useEffect(() => () => { speech.current?.abort(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { if (threat) say(`This sounds life threatening. Call nine one one now. I will keep taking notes for the response team.`); }, [threat]);

  function say(text: string, then?: () => void) {
    const synth = window.speechSynthesis;
    if (!synth) { then?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = 1.05;
    u.onend = () => then?.(); u.onerror = () => then?.();
    synth.speak(u);
  }
  function listen() {
    if (!Speech || listening) return;
    const r = new Speech(); r.lang = "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = e => setDraft(Array.from(e.results).map(x => x[0].transcript).join(" ").slice(0, 600));
    r.onerror = () => { setListening(false); setStatus("Microphone unavailable. Type the answer instead."); };
    r.onend = () => setListening(false);
    speech.current = r;
    try { r.start(); setListening(true); } catch { setStatus("Could not start the microphone. Type the answer instead."); }
  }
  function ask(index: number) { setStep(index); setDraft(""); say(CALL_QUESTIONS[index].prompt, listen); }
  function start() {
    setAnswers({}); setStatus(""); setReviewed(false); setPhase("asking");
    setStep(0);
    say("Safe Slack Force emergency line. If anyone is in immediate danger, call nine one one first. I will ask four quick questions and post the answers to the incident team in Slack.", () => ask(0));
  }
  function next() {
    speech.current?.stop();
    const merged = { ...answers, [CALL_QUESTIONS[step].key]: draft.trim() };
    setAnswers(merged);
    if (step + 1 < CALL_QUESTIONS.length) { ask(step + 1); return; }
    const t = Object.values(merged).map(a => lifeThreat(a ?? "")).find(Boolean);
    const text = callRecord(merged, t);
    setRecord(text); setPhase("review");
    say("Thank you. Please check the call record on screen before I send it to the team.");
  }
  function hangUp() { speech.current?.abort(); window.speechSynthesis?.cancel(); setListening(false); setPhase("idle"); }
  async function send() {
    if (!reviewed || submitting) return;
    setSubmitting(true); setStatus("Relaying the reviewed call record…");
    const id = crypto.randomUUID();
    try {
      await api.transcript(snapshot.incidentId, record.trim(), snapshot.version, id);
      for (let i = 0; i < 60; i++) {
        const r = await api.transcriptStatus(id);
        if (r.status !== "pending") {
          setStatus(r.status === "delivered" ? (snapshot.mode === "live" ? "Call record posted to Slack. The Commander is triaging it now." : "Call record saved to the offline fixture. Nothing was sent to Slack.")
            : "Delivery is not confirmed. Inspect the Slack thread before calling in again.");
          break;
        }
        await new Promise(res => setTimeout(res, 1000));
      }
      setPhase("sent"); say("Your report is with the incident team.");
    } catch (e) {
      setStatus(e instanceof Error ? `${e.message}. Inspect the thread before resubmitting.` : "Unable to relay. Inspect the thread before resubmitting.");
    } finally { setSubmitting(false); setReviewed(false); }
  }

  return <section className="voice-update emergency-call" aria-label="Emergency call agent">
    <h4>Emergency call agent</h4>
    {threat && <p className="emergency-call-alert" role="alert">Call 911 now. “{threat}” was reported. This agent logs and routes the report; it does not dispatch emergency services.</p>}
    {phase === "idle" && <>
      <p>A hands-free call for the person on site: the agent asks four triage questions out loud, you check the record, and it goes into this incident's Slack thread for the Commander.</p>
      <button type="button" className="primary-button" disabled={closed} onClick={start}>Start emergency call</button>
    </>}
    {phase === "asking" && <>
      <p><strong>Question {step + 1} of {CALL_QUESTIONS.length}:</strong> {CALL_QUESTIONS[step].prompt}</p>
      <textarea aria-label={CALL_QUESTIONS[step].label} value={draft} maxLength={600} placeholder={Speech ? "Listening… or type the answer" : "Type the answer"} onChange={e => setDraft(e.target.value)} />
      <div className="emergency-call-actions">
        {Speech && <button type="button" className="text-button" onClick={() => listening ? speech.current?.stop() : listen()}>{listening ? "Stop listening" : "Answer by voice"}</button>}
        <button type="button" className="text-button" onClick={() => ask(step)}>Repeat question</button>
        <button type="button" className="primary-button" disabled={listening} onClick={next}>{step + 1 < CALL_QUESTIONS.length ? "Next question" : "Finish call"}</button>
        <button type="button" className="text-button" onClick={hangUp}>Hang up</button>
      </div>
    </>}
    {phase === "review" && <>
      <textarea aria-label="Emergency call record" value={record} maxLength={4000} onChange={e => { setRecord(e.target.value); setReviewed(false); }} />
      <label><input type="checkbox" checked={reviewed} disabled={submitting} onChange={e => setReviewed(e.target.checked)} /> I checked the location, injuries and hazard details.</label>
      <div className="emergency-call-actions">
        <button type="button" className="primary-button" disabled={!reviewed || submitting || closed} onClick={() => void send()}>{submitting ? "Relaying…" : snapshot.mode === "live" ? "Post call record to Slack" : "Save call record to fixture"}</button>
        <button type="button" className="text-button" disabled={submitting} onClick={hangUp}>Discard</button>
      </div>
    </>}
    {phase === "sent" && <button type="button" className="text-button" onClick={start}>Take another call</button>}
    {status && <p role="status">{status}</p>}
  </section>;
}
