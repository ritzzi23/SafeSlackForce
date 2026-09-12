import { useEffect, useState } from 'react';
import type { IncidentReadiness, IncidentSnapshot } from '@safeslackforce/contracts';
import { api, safeUrl } from './api';
import './IncidentJourney.css';

export function useJourneyEvidence(snapshot: IncidentSnapshot, connected: boolean) {
  const key = `${snapshot.incidentId}:${snapshot.version}:${connected}`;
  const [result, setResult] = useState<{ key: string; data?: IncidentReadiness; error?: string }>();
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.readiness(snapshot.incidentId, controller.signal).then(data => {
        if (data.incidentId !== snapshot.incidentId || data.version < snapshot.version) throw new Error('Evidence is out of date');
        if (!controller.signal.aborted) setResult({ key, data });
      }).catch(e => {
        if (!controller.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : 'Evidence unavailable' });
      });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, connected, snapshot.incidentId, snapshot.version]);
  return result?.key === key ? result : undefined;
}
export function journeyStages(s: IncidentSnapshot, data?: IncidentReadiness) {
  const messages = data?.tasks.flatMap(t => t.notifications);
  const owned = s.tasks.filter(t => t.owner).length;
  const acknowledged = s.tasks.filter(t => ['acknowledged', 'in_progress', 'completed'].includes(t.status)).length;
  const contactFailed = messages?.some(n => ['failed', 'uncertain'].includes(n.state));
  const sent = messages?.filter(n => n.state === 'sent').length ?? 0;
  const handoffDone = ['handed_over', 'closed'].includes(s.status);
  return [
    { label: 'Intake', state: 'recorded', detail: 'Incident recorded', target: 'thread' },
    { label: 'Assign', state: s.tasks.length && owned === s.tasks.length ? 'recorded' : 'waiting', detail: `${owned}/${s.tasks.length} tasks owned`, target: 'tasks' },
    { label: 'Contact', state: !messages ? 'unknown' : contactFailed ? 'attention' : sent ? 'recorded' : 'waiting', detail: !messages ? 'Receipts unavailable' : `${sent} sent · ${messages.length} notifications`, target: 'notifications' },
    { label: 'Responses', state: s.tasks.length && acknowledged === s.tasks.length ? 'recorded' : 'waiting', detail: `${acknowledged}/${s.tasks.length} ownership accepted`, target: 'notifications' },
    { label: 'Draft', state: handoffDone || s.status === 'handoff_ready' ? 'recorded' : 'waiting', detail: s.status === 'handoff_ready' ? 'Ready for review' : handoffDone ? 'Handoff recorded' : s.reports.length ? 'Revision needed' : 'Not saved yet', target: 'activity' },
    { label: 'Handoff', state: handoffDone ? 'recorded' : 'waiting', detail: s.status === 'closed' ? 'Closed by human' : handoffDone ? 'Accepted by human' : 'Awaiting supervisor', target: 'thread' },
  ] as const;
}
type Panel = 'tasks' | 'activity' | 'thread' | 'notifications';
export function IncidentJourney({ snapshot, evidence, connected, transport, onOpen }: { snapshot: IncidentSnapshot; evidence?: IncidentReadiness; connected: boolean; transport: string; onOpen: (panel: Panel) => void }) {
  const active = snapshot.agents.filter(a => a.status === 'working');
  const problems = snapshot.agents.filter(a => ['failed', 'blocked'].includes(a.status));
  return <section className="incident-journey" aria-label="Incident journey">
    <div className="journey-heading"><strong>Incident journey</strong><span>{!connected ? 'SIMULATED PREVIEW' : snapshot.mode === 'fixture' ? 'FIXTURE DATA' : 'PERSISTED LIVE STATE'}</span></div>
    <ol>{journeyStages(snapshot, evidence).map((stage, index) => <li key={stage.label}><button className={`journey-stage ${stage.state}`} onClick={() => onOpen(stage.target)}><span className="journey-number">{stage.state === 'recorded' ? '✓' : index + 1}</span><strong>{stage.label}</strong><small>{stage.detail}</small></button></li>)}</ol>
    <div className="journey-now" role="status">
      {connected && transport !== 'connected' ? <strong>Live updates interrupted — showing the last snapshot.</strong> : active.length ? <><strong>Working now:</strong> {active.map(a => a.name).join(', ')}</> : problems.length ? <><strong>Needs attention:</strong> {problems.map(a => `${a.name}: ${a.waitingOn || a.summary}`).join(' · ')}</> : <><strong>Current state:</strong> {snapshot.status.replaceAll('_', ' ')}</>}
    </div>
    <small className="journey-note">Stages can overlap. Sent ≠ acknowledged ≠ physically completed. Open owned work can transfer at handoff.</small>
  </section>;
}

export function NotificationInbox({ snapshot, data, error, connected }: { snapshot: IncidentSnapshot; data?: IncidentReadiness; error?: string; connected: boolean }) {
  const [filter, setFilter] = useState('all');
  const notifications = data?.tasks.flatMap(task => task.notifications.map(n => ({ ...n, task }))) ?? [];
  const needsAttention = (n: typeof notifications[number]) => ['uncertain', 'failed'].includes(n.state);
  const outstanding = (n: typeof notifications[number]) => !n.acknowledgedBy && !['completed', 'cancelled'].includes(n.task.status);
  const shown = notifications.filter(n => filter === 'all' || (filter === 'attention' ? needsAttention(n) : outstanding(n)));
  return <section className="notification-inbox" aria-label="Notification inbox">
    <h3>Notifications & responses</h3>
    <p className="panel-intro">Actual dispatch records, not generated progress messages. Acknowledgement does not confirm physical completion.</p>
    {!connected ? <p>No live notification receipts in the standalone preview. Pair the workspace to inspect delivery.</p> : error ? <p role="alert">Unable to load delivery evidence: {error}</p> : !data ? <p role="status">Loading current delivery evidence…</p> : <>
      <div className="notification-counts"><span><strong>{notifications.length}</strong> recorded</span><span><strong>{notifications.filter(outstanding).length}</strong> awaiting response</span><span><strong>{notifications.filter(needsAttention).length}</strong> delivery issues</span></div>
      <div className="notification-filters" aria-label="Filter notifications">{['all', 'outstanding', 'attention'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'attention' ? 'Delivery issues' : 'Awaiting response'}</button>)}</div>
      {!shown.length && <p>No notifications in this view.</p>}
      {shown.map(n => <article key={n.id} className={`notification-card ${needsAttention(n) ? 'attention' : ''}`}>
        <div className="notification-title"><strong>{n.followup ? 'Backup follow-up' : 'Task notification'}</strong><span>{n.state === 'uncertain' ? 'Delivery unknown' : n.state.replaceAll('_', ' ')}</span></div>
        <h4>{n.task.title}</h4><p>To <strong>{snapshot.tasks.find(t => t.owner?.slackUserId === n.recipient)?.owner?.name ?? n.recipient}</strong></p>
        {n.text && <p>{n.text}</p>}
        <p className="notification-response">{n.acknowledgedBy ? `Acknowledgement recorded from ${n.acknowledgedBy}` : 'No acknowledgement recorded'}</p>
        {n.error && <p role="status">{n.error}</p>}
        {needsAttention(n) && <p>Inspect Slack before retrying; an uncertain request may already have been delivered.</p>}
        {!n.followup && n.state === 'sent' && outstanding(n) && n.dueAt && <p>Configured follow-up deadline: <time dateTime={new Date(n.dueAt).toISOString()}>{new Date(n.dueAt).toLocaleString()}</time>. The server determines whether follow-up is still needed.</p>}
        <details><summary>Delivery evidence</summary><p>Notification ID: {n.id}</p><p>Provider receipt: {n.receipt ?? 'Not recorded'}</p><p>Task state: {n.task.status}</p></details>
        {snapshot.slackThreadUrl && <a href={safeUrl(snapshot.slackThreadUrl)} target="_blank" rel="noreferrer">Open Slack thread ↗</a>}
      </article>)}
    </>}
    <h4>Recent recorded activity</h4>
    <ol className="notification-timeline">{snapshot.activity.slice(-6).reverse().map(event => <li key={event.id}><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString()}</time><span>{event.text}</span></li>)}</ol>
  </section>;
}
