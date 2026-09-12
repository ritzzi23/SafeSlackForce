import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readinessSchema, type IncidentReadiness } from '@safeslackforce/contracts';
import { demoSnapshot } from '../data';
import { IncidentJourney, NotificationInbox, journeyStages } from '../IncidentJourney';

function fixture() {
  const snapshot = demoSnapshot(1);
  snapshot.status = 'coordinating'; snapshot.reports = [];
  snapshot.tasks = [{ id: 'lead', title: 'Accept coordination', agentId: 'communications', status: 'assigned', version: 1, owner: { slackUserId: 'ULEAD', name: 'Demo Lead' }, blockedReason: null, sources: [], slackActionUrl: null }];
  const data: IncidentReadiness = readinessSchema.parse({ incidentId: snapshot.incidentId, version: snapshot.version,
    handoff: { state: 'pending', requirement: 'Supervisor accepts', blockers: [] }, closure: { state: 'pending', requirement: 'Human confirmation', blockers: [] },
    tasks: [{ taskId: 'lead', title: 'Accept coordination', status: 'assigned', owner: 'Demo Lead', explanation: '', sources: [], notifications: [{ id: 'n1', recipient: 'ULEAD', state: 'sent', acknowledgedBy: null, receipt: 'ts1', text: 'Please accept coordination', dueAt: 1800000000000, followup: false }] }],
  });
  return { snapshot, data };
}
describe('incident journey and notification visibility', () => {
  it('sent contact is not human acknowledgement or handoff', () => {
    const { snapshot, data } = fixture(); const stages = journeyStages(snapshot, data);
    expect(stages[2].state).toBe('recorded');
    expect(stages[3].state).toBe('waiting');
    expect(stages[5].state).toBe('waiting');
  });
  it('does not fabricate delivery evidence while loading or in standalone mode', () => {
    const { snapshot } = fixture();
    expect(journeyStages(snapshot)[2].state).toBe('unknown');
    expect(renderToStaticMarkup(<NotificationInbox snapshot={snapshot} connected={false} />)).toContain('No live notification receipts');
    expect(renderToStaticMarkup(<NotificationInbox snapshot={snapshot} connected />)).toContain('Loading current delivery evidence');
  });
  it('shows uncertain delivery even when acknowledgement is recorded separately', () => {
    const { snapshot, data } = fixture();
    data.tasks[0].notifications[0].state = 'uncertain';
    data.tasks[0].notifications[0].acknowledgedBy = 'ULEAD';
    expect(journeyStages(snapshot, data)[2].state).toBe('attention');
    const html = renderToStaticMarkup(<NotificationInbox snapshot={snapshot} data={data} connected />);
    expect(html).toContain('Delivery unknown'); expect(html).toContain('Acknowledgement recorded from ULEAD');
    expect(html).toContain('Inspect Slack before retrying');
  });
  it('reports missing revisions and disconnected transport explicitly', () => {
    const { snapshot } = fixture();
    snapshot.reports = [{ id: 'r', version: 1, title: 'Old draft', downloadUrl: '/api/report' }];
    expect(journeyStages(snapshot)[4].detail).toBe('Revision needed');
    const html = renderToStaticMarkup(<IncidentJourney snapshot={snapshot} connected transport="reconnecting" onOpen={() => {}} />);
    expect(html).toContain('Live updates interrupted'); expect(html).toContain('Open owned work can transfer');
  });
  it('renders recipient, payload, follow-up deadline and receipt while escaping text', () => {
    const { snapshot, data } = fixture(); data.tasks[0].notifications[0].text = '<script>not markup</script>';
    const html = renderToStaticMarkup(<NotificationInbox snapshot={snapshot} data={data} connected />);
    expect(html).toContain('Demo Lead'); expect(html).toContain('ts1'); expect(html).toContain('Configured follow-up deadline');
    expect(html).not.toContain('<script>'); expect(html).toContain('No acknowledgement recorded');
  });
});
