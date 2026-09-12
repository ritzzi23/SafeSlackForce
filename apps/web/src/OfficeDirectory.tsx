import { useEffect, useState } from 'react';
import { api } from './api';
import './OfficeDirectory.css';

export default function OfficeDirectory({ connected }: { connected: boolean }) {
  const [category, setCategory] = useState('departments');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ key: string; data?: Awaited<ReturnType<typeof api.office>>; error?: string }>();
  const key = `${category}:${query}:${connected}`;
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.office(category, query, controller.signal).then(data => {
        if (!controller.signal.aborted) setResult({ key, data });
      }).catch(e => {
        if (!controller.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : 'Directory unavailable' });
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, query, connected, key]);
  const current = result?.key === key ? result : undefined;
  return <section className="office-directory" aria-label="Synthetic office directory">
    <h3>Office reference database</h3>
    <p className="blocker-note">Synthetic demo only. No real patients, valid coverage, callable numbers or actual telephone calls. Medical records and individual enrollment are not accessible here.</p>
    {!connected ? <p>Pair the workspace to browse the database.</p> : <>
      <label>Category <select value={category} onChange={e => setCategory(e.target.value)}>
        {['departments', 'employees', 'contacts', 'facilities', 'insurance_plans', 'healthcare_services', 'management', 'protocols', 'policies', 'call_logs'].map(c => <option value={c} key={c}>{c.replaceAll('_', ' ')}</option>)}
      </select></label>
      <label> Search <input aria-label="Search office records" maxLength={120} value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, department or policy…" /></label>
      {current?.error ? <p role="alert">{current.error}</p> : !current?.data ? <p role="status">Loading office records…</p> : <>
        <p>{current.data.total} matches · showing {current.data.records.length}. Refine the search for more specific results.</p>
        {current.data.records.map(r => <details className="task-card" key={r.id}>
          <summary>{r.title} · v{r.version}</summary>
          <small>{r.id}</small>
          <dl>{Object.entries(r.details).map(([name, value]) => <div key={name}><dt><strong>{name}</strong></dt><dd>{Array.isArray(value) ? <ul>{value.map((v, n) => <li key={n}>{v}</li>)}</ul> : value}</dd></div>)}</dl>
          <p>Linked records: {r.references.join(', ') || 'None'}</p>
        </details>)}
      </>}
    </>}
  </section>;
}
