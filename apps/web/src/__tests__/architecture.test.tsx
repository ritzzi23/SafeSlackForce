import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ArchitectureDiagram from '../explain/ArchitectureDiagram';

describe('architecture diagram labels', () => {
  it('splits the notification labels into four vertically contained lines', () => {
    const html = renderToStaticMarkup(<ArchitectureDiagram />);
    expect(html).toContain('x="480" y="220" width="190" height="80"');
    for (const [label, y] of [
      ['Notification +', 240.5], ['response pumps', 257.5],
      ['Backup chase · alerts', 275.5], ['Scheduled updates', 289.5],
    ] as const) {
      expect(html).toContain(`<tspan x="575" y="${y}">${label}</tspan>`);
      expect(y).toBeGreaterThan(220 + 14);
      expect(y).toBeLessThan(300 - 8);
    }
    expect(html).not.toContain('Notification + response pumps</text>');
  });

  it('keeps incoming and outgoing arrows on the resized box boundary', () => {
    const html = renderToStaticMarkup(<ArchitectureDiagram />);
    expect(html).toContain('x1="575" y1="200" x2="575" y2="220"');
    expect(html).toContain('x1="575" y1="300" x2="575" y2="320"');
  });
});
