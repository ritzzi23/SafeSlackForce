import { useEffect, useState } from 'react';
import type { IncidentReadiness } from '@incidentos/contracts';
import { api } from './api';

export function ReadinessContent({ data }: { data: IncidentReadiness }) {
  const titles = new Map(data.tasks.map(t => [t.taskId, t.title]));
  return <section className="task-card" aria-label="Action readiness">
    <h3>What happens next?</h3>
    <p className="panel-intro">Server-checked prerequisites, not permission to act or a site-safety assessment.</p>
    {(['handoff', 'closure'] as const).map(key => {
      const gate = data[key];
      return <details key={key} open={gate.state !== 'done'}>
        <summary>{key === 'handoff' ? 'Handoff' : 'Closure'} · {gate.state === 'done' ? 'Recorded' : gate.blockers.length ? `${gate.blockers.length} unmet prerequisites` : 'Awaiting human confirmation'}</summary>
        <p>{gate.requirement}</p>
        {gate.blockers.map(b => <div className="blocker-note" key={b.code}>
          <strong>{b.message}</strong>
          {b.taskIds.length > 0 && <ul>{b.taskIds.map(id => <li key={id}>{titles.get(id) ?? id}</li>)}</ul>}
          <small>{b.code}</small>
        </div>)}
      </details>;
    })}
    <details>
      <summary>Delivery, acknowledgement and completion</summary>
      {data.tasks.map(t => <div key={t.taskId}>
        <h4>{t.title}</h4>
        <p>Owner: {t.owner ?? 'Unassigned'} · {t.status.replaceAll('_', ' ')}</p>
        <p>{t.explanation}</p>
        {!t.notifications.length && <p>No notification recorded for this task.</p>}
        <ul>{t.notifications.map(n => <li key={n.id}>
          To {n.recipient}: {n.state}. {n.acknowledgedBy ? `Acknowledgement recorded from ${n.acknowledgedBy}.` : 'No acknowledgement recorded.'}
          {n.receipt && <small> Receipt: {n.receipt}</small>}
          {n.state === 'uncertain' && <span> Delivery is unknown; check Slack before retrying.</span>}
        </li>)}</ul>
      </div>)}
    </details>
  </section>;
}

export default function ActionReadiness({ incidentId, version }: { incidentId: string; version: number }) {
  const [result, setResult] = useState<{ id: string; requestedVersion: number; data?: IncidentReadiness; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    const timer = setTimeout(() => {
      api.readiness(incidentId, controller.signal).then(data => {
        if (data.incidentId !== incidentId || data.version < version) throw new Error('Readiness is out of date. Retry to refresh.');
        if (!controller.signal.aborted) setResult({ id: incidentId, requestedVersion: version, data });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ id: incidentId, requestedVersion: version, error: error instanceof Error ? error.message : 'Readiness unavailable' });
      });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [incidentId, version, retry]);
  const current = result?.id === incidentId && result.requestedVersion === version ? result : undefined;
  if (current?.error) return <div className="blocker-note" role="status">Readiness unavailable: {current.error} <button onClick={() => setRetry(v => v + 1)}>Retry</button></div>;
  if (!current?.data) return <p role="status">Checking action prerequisites…</p>;
  return <ReadinessContent data={current.data} />;
}
