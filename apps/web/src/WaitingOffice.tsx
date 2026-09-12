import { lazy, Suspense, useEffect, useState } from 'react';
import type { AgentId, IncidentSnapshot } from '@safeslackforce/contracts';
import { agentIds } from '@safeslackforce/contracts';
import { api } from './api';
import { departments } from './data';
import { PROJECT_NAME } from './branding';

const OfficeScene = lazy(() => import('./OfficeScene'));
const idle: IncidentSnapshot = {
  schemaVersion: 1, incidentId: '', version: 0, cursor: 0, mode: 'live',
  title: '', location: '', status: 'reported', slackThreadUrl: '', slackConnection: 'connected',
  agents: agentIds.map(id => ({ id, name: departments[id].name, status: 'idle', currentTaskId: null,
    summary: 'Ready for the next incident.', waitingOn: null, sources: [] })),
  tasks: [], activity: [], reports: [], responseActions: [],
};

export default function WaitingOffice({ onIncident, reduced }: {
  onIncident: (snapshot: IncidentSnapshot, incidents: { incidentId: string; title: string; status: string }[]) => void;
  reduced: boolean;
}) {
  const [selected, setSelected] = useState<AgentId>('commander');
  const [connection, setConnection] = useState('Checking workspace connection…');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const list = await api.incidents();
        if (stopped) return;
        if (list.length) {
          const snapshot = await api.snapshot(list[list.length - 1].incidentId);
          if (!stopped) onIncident(snapshot, list);
          return;
        }
        const health = await api.health();
        if (!stopped) setConnection(health.slack === 'connected' ? 'Slack connected · Watching for new incidents' : 'Waiting for Slack to reconnect');
      } catch {
        if (!stopped) setConnection('Workspace connection unavailable · Retrying');
      }
      if (!stopped) timer = setTimeout(check, 2500);
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [onIncident]);
  return <div className="waiting-workspace">
    <header className="waiting-header"><a href="/">{PROJECT_NAME}</a><span>LIVE WORKSPACE</span></header>
    <main className="waiting-layout">
      <section className="waiting-office" aria-label="Idle agent office">
        <div className="waiting-heading"><p>INCIDENT COMMAND OFFICE</p><h1>Your team is ready.</h1><span>5 agents on standby · No active incidents</span></div>
        <div className="waiting-scene"><Suspense fallback={<div className="scene-loading">Preparing your workspace…</div>}>
          <OfficeScene snapshot={idle} selected={selected} onSelect={setSelected} reset={0} zoom={1} handoff={undefined} reduced={reduced} />
        </Suspense></div>
        <p className="waiting-connection" role="status">{connection}</p>
      </section>
      <aside className="waiting-panel">
        <span className="waiting-eyebrow">A CLEAN SLATE</span><h2>Waiting for your first incident</h2>
        <p>Report an incident in Slack by mentioning the bot. Your Commander will bring the team to work, and this office will update automatically.</p>
        <div className="waiting-counts"><span><strong>0</strong>Incidents</span><span><strong>0</strong>Tasks</span><span><strong>0</strong>Reports</span></div>
        <div className="waiting-agent"><span>{departments[selected].code}</span><div><h3>{departments[selected].name}</h3><p>{departments[selected].role}</p></div><small>Ready</small></div>
        <p className="waiting-hint">Select any agent to explore the office while you wait.</p>
      </aside>
    </main>
  </div>;
}
