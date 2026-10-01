import type { IncidentSnapshot, SourceRef } from '@safeslackforce/contracts';

type Event = IncidentSnapshot['activity'][number];
type HistoryPage = {
  columns: ['id', 'timestamp', 'text', 'sourceIndexes'];
  events: [string, string, string, number[]][];
  sources: SourceRef[];
  nextOffset: number | null;
};

// Preserve every event and source field while avoiding repeated source metadata.
// Each event's source indexes refer to this page's sources array.
export function historyPage(history: Event[], offset: number, maxChars = 36000): HistoryPage {
  const page: HistoryPage = { columns: ['id', 'timestamp', 'text', 'sourceIndexes'], events: [], sources: [], nextOffset: null };
  const indexes = new Map<string, number>();
  for (let n = offset; n < history.length; n++) {
    const event = history[n];
    const oldSources = page.sources.length;
    const addedKeys: string[] = [];
    const refs = event.sources.map(source => {
      const key = JSON.stringify(source);
      let index = indexes.get(key);
      if (index === undefined) {
        index = page.sources.length; indexes.set(key, index);
        page.sources.push(source); addedKeys.push(key);
      }
      return index;
    });
    page.events.push([event.id, event.timestamp, event.text, refs]);
    page.nextOffset = n + 1 < history.length ? n + 1 : null;
    if (JSON.stringify(page).length > maxChars) {
      page.events.pop(); page.sources.length = oldSources;
      for (const key of addedKeys) indexes.delete(key);
      if (!page.events.length) throw new Error('Timeline entry exceeds the bounded report context; use the structured report');
      page.nextOffset = n;
      break;
    }
  }
  return page;
}
