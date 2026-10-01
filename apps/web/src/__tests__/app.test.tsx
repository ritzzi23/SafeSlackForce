// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { IncidentSnapshot, StreamUpdate } from '@safeslackforce/contracts';
import App from '../App';
import WaitingOffice from '../WaitingOffice';
import { api, ApiError } from '../api';
import { demoSnapshot } from '../data';

vi.mock('../OfficeScene', () => ({ default: () => <div>Office scene</div> }));
vi.mock('../SlackThread', () => ({ default: () => <div>Slack sources</div> }));
vi.mock('../ActionReadiness', () => ({ default: () => <div>Readiness</div> }));
vi.mock('../OfficeDirectory', () => ({ default: () => <div>Office directory</div> }));
vi.mock('../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, health: vi.fn(), incidents: vi.fn(), snapshot: vi.fn(), pair: vi.fn(), ask: vi.fn(), answer: vi.fn(), stream: vi.fn() } };
});

function snapshot(id: string, version: number): IncidentSnapshot {
  const value = { ...demoSnapshot(1), incidentId: id, version, cursor: version, title: `Incident ${id}` };
  value.agents[0].summary = `${id} version ${version}`;
  return value;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
type Subscription = { id: string; update: (event: StreamUpdate) => void; state: (value: 'connected' | 'reconnecting') => void; close: ReturnType<typeof vi.fn> };
let subscriptions: Subscription[];
let container: HTMLDivElement;
let root: Root;
const list = ['A', 'B', 'C'].map(id => ({ incidentId: id, title: `Incident ${id}`, status: 'coordinating' }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, '', '/');
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  subscriptions = [];
  vi.mocked(api.health).mockResolvedValue({ ok: true, mode: 'fixture', slack: 'disconnected', modelConfigured: false });
  vi.mocked(api.incidents).mockResolvedValue(list);
  vi.mocked(api.snapshot).mockImplementation(async id => snapshot(id, 10));
  vi.mocked(api.pair).mockResolvedValue({ paired: true });
  vi.mocked(api.ask).mockResolvedValue({ status: 'pending' });
  vi.mocked(api.answer).mockResolvedValue({ requestId: 'answered', status: 'done', answer: 'Answered' });
  vi.mocked(api.stream).mockImplementation((id, _cursor, update, state) => {
    const close = vi.fn(); subscriptions.push({ id, update, state, close });
    return close;
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function mount() { await act(async () => root.render(<App />)); }
function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function selectIncident(id: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Select incident"]')!;
    select.value = id; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function fill(selector: string, value: string) {
  await act(async () => {
    const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function update(subscription: Subscription, value: IncidentSnapshot) {
  await act(async () => subscription.update({ eventId: `${value.incidentId}:${value.cursor}`, cursor: value.cursor, kind: 'snapshot.updated', snapshot: value }));
}
function tab(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find(element => element.querySelector('span')?.textContent === label);
  if (!found) throw new Error(`Missing tab: ${label}`);
  return found;
}
function metric(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Incident at a glance"] button')]
    .find(element => [...element.querySelectorAll('span')].some(span => span.textContent === label));
  if (!found) throw new Error(`Missing incident metric: ${label}`);
  return found;
}
function activePanel(label: string) {
  const selected = tab(label);
  expect(selected.getAttribute('aria-selected')).toBe('true');
  expect(selected.tabIndex).toBe(0);
  expect(container.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
  expect(container.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
  const panel = document.getElementById(selected.getAttribute('aria-controls')!);
  expect(panel?.getAttribute('role')).toBe('tabpanel');
  expect(panel?.getAttribute('aria-labelledby')).toBe(selected.id);
  return panel!;
}

it('moves tab focus with arrow and boundary keys and exposes the associated Directory panel', async () => {
  vi.mocked(api.health).mockRejectedValue(new Error('Standalone preview'));
  await mount();
  activePanel('Chat');
  tab('Chat').focus();

  const navigate = async (key: string, label: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    await act(async () => document.activeElement!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tab(label));
    return activePanel(label);
  };

  await navigate('ArrowRight', 'Tasks');
  expect((await navigate('ArrowRight', 'Slack')).textContent).toContain('Slack sources');
  await navigate('ArrowRight', 'Activity');
  expect((await navigate('End', 'Directory')).textContent).toContain('Office directory');
  await navigate('ArrowRight', 'Chat');
  await navigate('ArrowLeft', 'Directory');
  await navigate('Home', 'Chat');
  expect(tab('Directory').tabIndex).toBe(-1);
});

it('updates the incident summary when evidence conflicts and directs attention to the task review', async () => {
  vi.mocked(api.health).mockRejectedValue(new Error('Standalone preview'));
  await mount();
  expect(metric('Need review').querySelector('strong')?.textContent).toBe('0');
  await click('Demo stage 4: Conflicting evidence');
  expect(metric('Need review').querySelector('strong')?.textContent).toBe('1');
  expect(metric('Open tasks').querySelector('strong')?.textContent).toBe('3');
  expect(container.textContent).toContain('1 task needs your attention');

  await click('Review tasks');
  const panel = activePanel('Tasks');
  expect(panel.textContent).toContain('Confirm affected area status');
  expect(panel.textContent).toContain('Two witness accounts disagree about occupancy.');
  expect(panel.textContent).toContain('needs review');

  await act(async () => metric('Agents working').click());
  expect(activePanel('Activity').textContent).toContain('Witness accounts conflict. Area confirmation requires review.');
  await act(async () => metric('Need review').click());
  activePanel('Tasks');
});

it('shows an empty task summary at the first report and routes the next step to the Commander', async () => {
  vi.mocked(api.health).mockRejectedValue(new Error('Standalone preview'));
  await mount();
  await click('Demo stage 1: Report received');
  expect(metric('Open tasks').querySelector('strong')?.textContent).toBe('0');
  expect(metric('Need review').querySelector('strong')?.textContent).toBe('0');
  expect(container.textContent).toContain('Start with the incident report');
  await click('Chat with Evidence');
  await act(async () => metric('Open tasks').click());
  expect(activePanel('Tasks').textContent).toContain('No tasks assigned yet');

  await click('Ask Commander');
  activePanel('Chat');
  expect(container.querySelector('[aria-label="Message Commander"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Message Evidence"]')).toBeNull();
  expect(api.ask).not.toHaveBeenCalled();
});

it('keeps unfinished work visible after handoff and opens its assigned tasks', async () => {
  vi.mocked(api.health).mockRejectedValue(new Error('Standalone preview'));
  await mount();
  await click('Demo stage 4: Conflicting evidence');
  await click('Demo stage 5: Handoff accepted');
  expect(metric('Open tasks').querySelector('strong')?.textContent).toBe('2');
  expect(metric('Need review').querySelector('strong')?.textContent).toBe('0');
  expect(container.textContent).toContain('2 tasks remain open. A handoff does not confirm that physical work is complete.');
  expect(button('Download handoff report').disabled).toBe(false);

  await click('View open tasks');
  const panel = activePanel('Tasks');
  expect(panel.textContent).toContain('2 open');
  const outstanding = [...panel.querySelectorAll('h3')]
    .find(heading => heading.textContent === 'Confirm external service contact')?.parentElement;
  expect(outstanding?.textContent).toContain('assigned');
  expect(outstanding?.textContent).toContain('Ritesh');
  expect(outstanding?.textContent).not.toContain('completed');
});

it('keeps a newer SSE snapshot when an older refresh request finishes later', async () => {
  await mount();
  const pending = deferred<IncidentSnapshot>();
  vi.mocked(api.snapshot).mockReturnValueOnce(pending.promise);
  await click('Connect backend'); await click('Refresh incidents');
  await update(subscriptions[0], snapshot('A', 20));
  await act(async () => pending.resolve(snapshot('A', 11)));
  expect(container.textContent).toContain('A version 20');
  expect(container.textContent).not.toContain('A version 11');
});

it('keeps newer evidence when stale-question recovery races an SSE event', async () => {
  await mount();
  const pending = deferred<IncidentSnapshot>();
  vi.mocked(api.ask).mockRejectedValueOnce(new ApiError(409, 'Incident changed'));
  vi.mocked(api.snapshot).mockReturnValueOnce(pending.promise);
  await fill('[aria-label="Message Commander"]', 'What changed?');
  await click('Send message');
  await update(subscriptions[0], snapshot('A', 30));
  await act(async () => pending.resolve(snapshot('A', 29)));
  expect(container.textContent).toContain('A version 30');
  expect(container.textContent).toContain('please review it and send your question again');
  expect(api.ask).toHaveBeenCalledTimes(1);
});

it('honors the latest incident selection, ignores old stream callbacks, and clears drafts', async () => {
  await mount();
  await fill('[aria-label="Message Commander"]', 'Question about A');
  const b = deferred<IncidentSnapshot>(), c = deferred<IncidentSnapshot>();
  vi.mocked(api.snapshot).mockImplementation(id => id === 'B' ? b.promise : c.promise);
  await selectIncident('B');
  expect(button('Send message').disabled).toBe(true);
  await selectIncident('C');
  await act(async () => c.resolve(snapshot('C', 1)));
  await update(subscriptions[0], snapshot('A', 99));
  await act(async () => b.resolve(snapshot('B', 50)));
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Select incident"]')!.value).toBe('C');
  expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Message Commander"]')!.value).toBe('');
  expect(container.textContent).toContain('C version 1');
  expect(window.location.search).toBe('?incidentId=C');
  expect(api.ask).not.toHaveBeenCalled();
  expect(subscriptions[0].close).toHaveBeenCalledOnce();
});

it('does not let a pending incident fetch switch the user out of the demo', async () => {
  await mount();
  const pending = deferred<IncidentSnapshot>();
  vi.mocked(api.snapshot).mockReturnValueOnce(pending.promise);
  await selectIncident('B'); await click('Return to demo');
  await act(async () => pending.resolve(snapshot('B', 20)));
  expect(container.textContent).toContain('INTERACTIVE DEMO');
  expect(container.querySelector('[aria-label="Select incident"]')).toBeNull();
});

it('offers pairing when an empty live workspace loses its session, then returns to waiting after pairing', async () => {
  vi.mocked(api.health).mockResolvedValue({ ok: true, mode: 'live', slack: 'connected', modelConfigured: true });
  vi.mocked(api.incidents).mockResolvedValue([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError(401, 'Pair dashboard'));
  await mount();
  expect(container.textContent).toContain('Your workspace session expired');
  expect(container.querySelector('#pair-token')).not.toBeNull();
  await fill('#pair-token', 'test-only-pairing-token');
  await click('Pair workspace');
  expect(api.pair).toHaveBeenCalledWith('test-only-pairing-token');
  expect(container.textContent).toContain('Waiting for your first incident');
  await click('Workspace settings');
  expect(container.textContent).toContain('Workspace connected');
  await click('Close dialog');
  expect(container.textContent).toContain('Waiting for your first incident');
});

it('restores the pairing dialog when an active incident stream loses authentication', async () => {
  await mount();
  vi.mocked(api.incidents).mockRejectedValueOnce(new ApiError(401, 'Pair dashboard'));
  await act(async () => subscriptions[0].state('reconnecting'));
  expect(container.querySelector('#pair-token')).not.toBeNull();
  expect(container.textContent).toContain('Your workspace session expired');
  expect(subscriptions[0].close).toHaveBeenCalledOnce();
});

it('retries a temporary waiting-office outage without discarding authentication', async () => {
  vi.useFakeTimers();
  const auth = vi.fn(), received = vi.fn();
  vi.mocked(api.incidents).mockResolvedValue([]).mockRejectedValueOnce(new Error('Temporary outage'));
  vi.mocked(api.health).mockResolvedValue({ ok: true, mode: 'live', slack: 'connected', modelConfigured: true });
  await act(async () => root.render(<WaitingOffice onIncident={received} onAuthRequired={auth} onConnect={vi.fn()} reduced />));
  expect(container.textContent).toContain('Workspace connection unavailable');
  await act(async () => vi.advanceTimersByTimeAsync(2500));
  expect(container.textContent).toContain('Slack connected');
  expect(auth).not.toHaveBeenCalled(); expect(received).not.toHaveBeenCalled();
});

it('accepts stream updates during re-pairing before the refreshed snapshot arrives', async () => {
  await mount();
  vi.mocked(api.incidents).mockRejectedValueOnce(new ApiError(401, 'Pair dashboard'));
  await act(async () => subscriptions[0].state('reconnecting'));
  const pending = deferred<IncidentSnapshot>();
  vi.mocked(api.snapshot).mockReturnValueOnce(pending.promise);
  await fill('#pair-token', 'test-only-pairing-token');
  await click('Pair workspace');
  expect(subscriptions).toHaveLength(2);
  await update(subscriptions[1], snapshot('A', 20));
  await act(async () => pending.resolve(snapshot('A', 11)));
  expect(container.textContent).toContain('A version 20');
});
