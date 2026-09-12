import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoSnapshot } from '../data';
import ResponseBoard from '../ResponseBoard';
import IncidentShare from '../IncidentShare';
afterEach(() => vi.unstubAllGlobals());

describe('autonomous response presentation', () => {
  it('shows a simulated call separately from an actual delivery receipt', () => {
    const snapshot = demoSnapshot(1);
    snapshot.responseActions = [
      { id: 'management', kind: 'management', title: 'Inform management', status: 'completed', summary: 'Management notified.', dueAt: null, receipt: 'slack-receipt-1', updatedAt: '2026-09-12T19:00:00Z', sources: [] },
      { id: 'emergency_call', kind: 'emergency_call', title: 'Emergency call dispatch', status: 'simulated', summary: 'No telephone call was placed.', dueAt: null, receipt: 'simulation-1', updatedAt: '2026-09-12T19:00:00Z', sources: [] },
    ];
    const html = renderToStaticMarkup(<ResponseBoard snapshot={snapshot} />);
    expect(html).toContain('SIMULATED · no real call');
    expect(html).toContain('slack-receipt-1');
    expect(html).toContain('Acting automatically');
  });
  it('shares the canonical Slack thread without a dashboard credential or localhost link', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' });
    const snapshot = demoSnapshot(1);
    snapshot.slackThreadUrl = 'https://app.slack.com/archives/CDEMO/p123400';
    const html = renderToStaticMarkup(<IncidentShare snapshot={snapshot} />);
    expect(html).toContain('href="https://app.slack.com/archives/CDEMO/p123400"');
    expect(html).toContain('Participants need access to this Slack workspace and channel');
    expect(html).not.toContain('localhost');
    expect(html).not.toContain('DASHBOARD_TOKEN');
  });
});
