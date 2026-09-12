import { BellRing, CalendarClock, PhoneCall, Zap } from 'lucide-react';
import type { IncidentSnapshot } from '@safeslackforce/contracts';
export default function ResponseBoard({ snapshot }: { snapshot: IncidentSnapshot }) {
  const actions = snapshot.responseActions ?? [];
  if (!actions.length) return null;
  const icons = { management: BellRing, followup: CalendarClock, emergency_call: PhoneCall };
  return <section className="response-board" aria-label="Autonomous response actions">
    <div className="response-board-heading"><Zap size={14} /><strong>Autopilot</strong><span>Acting automatically · monitoring updates</span></div>
    <div className="response-action-grid">{actions.map(a => {
      const Icon = icons[a.kind];
      return <details className={`response-action ${a.status}`} key={a.id}>
        <summary><Icon size={17} /><span>{a.title}<small>{a.status === 'completed' ? 'Delivered' : a.status === 'simulated' ? 'SIMULATED · no real call' : a.status === 'scheduled' ? `Next: ${new Date(a.dueAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : a.status}</small></span></summary>
        <p>{a.summary}</p>{a.receipt && <small className="response-receipt">Receipt: {a.receipt}</small>}
        {a.sources.length > 0 && <small>{a.sources.filter(s => s.kind === 'procedure').map(s => s.label).join(' · ')}</small>}
      </details>;
    })}</div>
  </section>;
}
