import { lazy, Suspense, useEffect, useState } from 'react';
import type { AgentId, IncidentSnapshot } from '@safeslackforce/contracts';
import { agentIds } from '@safeslackforce/contracts';
import { api, ApiError } from './api';
import { departments } from './data';
import { PROJECT_NAME } from './branding';
import ThemeToggle from './ThemeToggle';

const OfficeScene = lazy(() => import('./OfficeScene'));
const idle: IncidentSnapshot = {
  schemaVersion: 1, incidentId: '', version: 0, cursor: 0, mode: 'live',
  title: '', location: '', status: 'reported', slackThreadUrl: '', slackConnection: 'connected',
  agents: agentIds.map(id => ({ id, name: departments[id].name, status: 'idle', currentTaskId: null,
    summary: 'Ready for the next incident.', waitingOn: null, sources: [] })),
  tasks: [], activity: [], reports: [], responseActions: [],
};
const responsibilities: Record<AgentId, string> = {
  commander: 'Keeps the response organized and brings the specialists’ findings together.',
  procedure: 'Finds the relevant procedure and turns it into clear tasks with owners.',
  evidence: 'Compares reports, links supporting facts, and flags details that need clarification.',
  communications: 'Notifies the right people and tracks who has acknowledged their tasks.',
  records: 'Maintains the incident timeline and prepares a report for the next person taking over.',
};

export default function WaitingOffice({ onIncident, onAuthRequired, onConnect, reduced }: {
  onIncident: (snapshot: IncidentSnapshot, incidents: { incidentId: string; title: string; status: string }[]) => void;
  reduced: boolean;
  onAuthRequired: () => void;
  onConnect: () => void;
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
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiError && error.status === 401) { onAuthRequired(); return; }
        if (!stopped) setConnection('Workspace connection unavailable · Retrying');
      }
      if (!stopped) timer = setTimeout(check, 2500);
    };
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [onIncident, onAuthRequired]);
  return <div className="waiting-workspace">
    <header className="waiting-header"><a href="/">{PROJECT_NAME}</a><div className="waiting-header-actions"><span className="waiting-live-status">LIVE WORKSPACE</span><ThemeToggle /></div></header>
    <main className="waiting-layout">
      <section className="waiting-office" aria-label="Idle agent office">
        <div className="waiting-heading"><p>INCIDENT COMMAND OFFICE</p><h1>Your team is ready.</h1><span>5 agents on standby · No active incidents</span></div>
        <div className="waiting-scene"><Suspense fallback={<div className="scene-loading">Preparing your workspace…</div>}>
          <OfficeScene snapshot={idle} selected={selected} onSelect={setSelected} reset={0} zoom={1.6} handoff={undefined} reduced={reduced} />
        </Suspense></div>
        <p className="waiting-connection" role="status">{connection}</p>
      </section>
      <aside className="waiting-panel">
        <span className="waiting-eyebrow">GET STARTED IN SLACK</span><h2>Waiting for your first incident</h2>
        <p>Your AI team turns a Slack report into shared facts, assigned tasks, and a clear record of the response.</p>
        <ol className="waiting-start-steps" aria-label="How to start an incident">
          <li><strong>Report what happened</strong><p>Mention the bot in your incident channel. Include the location and what you observed.</p></li>
          <li><strong>Follow the response here</strong><p>This office updates automatically as agents review the report and coordinate the work.</p></li>
          <li><strong>Confirm actions in Slack</strong><p>People acknowledge tasks, clarify facts, and confirm when work is complete.</p></li>
        </ol>
        <div className="waiting-agent-switcher" role="group" aria-label="Explore your response team">
          {agentIds.map(id => <button type="button" key={id} aria-pressed={selected === id} onClick={() => setSelected(id)}>{id === 'communications' ? 'Comms' : departments[id].name}</button>)}
        </div>
        <div className="waiting-agent"><span>{departments[selected].code}</span><div><h3>{departments[selected].name}</h3><p>{departments[selected].role}</p></div><small>Ready</small></div>
        <p className="waiting-agent-description">{responsibilities[selected]}</p>
        <button className="text-button" onClick={onConnect}>Workspace settings</button>
      </aside>
    </main>
  </div>;
}
