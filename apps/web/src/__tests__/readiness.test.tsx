import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IncidentReadiness } from '@incidentos/contracts';
import { ReadinessContent } from '../ActionReadiness';

const data: IncidentReadiness = {
  incidentId: 'TEST', version: 1,
  handoff: { state: 'pending', blockers: [], requirement: 'Supervisor must accept.' },
  closure: { state: 'pending', blockers: [{ code: 'CRITICAL_TASKS_OPEN', message: 'Critical tasks are still open', taskIds: ['area'] }], requirement: 'Supervisor and closure note required.' },
  tasks: [{ taskId: 'area', title: 'Confirm area status', status: 'assigned', owner: 'Ritesh', explanation: 'Completion has not been confirmed.', sources: [], notifications: [{ id: 'n', recipient: 'ULEAD', state: 'uncertain', acknowledgedBy: null, receipt: null }] }],
};
describe('action-readiness explanations', () => {
  it('labels readiness as awaiting a person and exposes real task dependencies', () => {
    const html = renderToStaticMarkup(<ReadinessContent data={data} />);
    expect(html).toContain('Awaiting human confirmation');
    expect(html).toContain('CRITICAL_TASKS_OPEN');
    expect(html).toContain('Confirm area status');
    expect(html).toContain('No acknowledgement recorded.');
    expect(html).toContain('Delivery is unknown; check Slack before retrying.');
  });
  it('escapes server text and distinguishes accepted ownership from completion', () => {
    const copy = structuredClone(data);
    copy.tasks[0].title = '<script>unsafe</script>';
    copy.tasks[0].notifications[0].state = 'sent';
    copy.tasks[0].notifications[0].acknowledgedBy = 'ULEAD';
    const html = renderToStaticMarkup(<ReadinessContent data={copy} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Acknowledgement recorded from ULEAD.');
    expect(html).toContain('Completion has not been confirmed.');
  });
});
