import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { api, ApiError } from '../apps/web/src/api.js';
import { snapshotSchema } from '@incidentos/contracts';

// Real frontend API adapter through Vite's proxy. Creates one fixture rehearsal;
// no Slack, OpenRouter or Exa calls. Requires both development servers running.
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const originalFetch = globalThis.fetch;
let cookie = '';
globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('Origin', origin);
  if (cookie) headers.set('Cookie', cookie);
  const response = await originalFetch(new URL(String(input), origin), { ...init, headers });
  const nextCookie = response.headers.get('set-cookie');
  if (nextCookie) cookie = nextCookie.split(';')[0];
  return response;
};
assert.equal((await api.health()).mode, 'fixture', 'Refusing synthetic rehearsal against live server');
await assert.rejects(api.incidents(), (e: unknown) => e instanceof ApiError && e.status === 401);
await api.pair(process.env.DASHBOARD_TOKEN || '');
let snapshot = await api.createFixture();
const id = snapshot.incidentId;
assert.equal(snapshot.agents.length, 5);
assert.equal(snapshot.tasks.length, 3);
assert.equal(snapshot.slackThreadUrl, '');
assert.ok((await api.incidents()).some(i => i.incidentId === id));
assert.ok((await api.details(id)).messages.length);
await assert.rejects(api.ask(id, 'commander', 'Status?', 0, randomUUID()), (e: unknown) => e instanceof ApiError && e.status === 409);
const requestId = randomUUID();
await api.ask(id, 'records', 'Prepare a sourced handoff with open tasks.', snapshot.version, requestId);
let result = await api.answer(requestId);
for (let attempt = 0; result.status === 'pending' && attempt < 100; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 100));
  result = await api.answer(requestId);
}
assert.equal(result.status, 'done');
assert.ok(result.answer);
snapshot = await api.snapshot(id);
const report = snapshot.reports.at(-1);
assert.ok(report);
const download = await fetch(report.downloadUrl);
assert.equal(download.status, 200);
assert.match(await download.text(), /handoff/i);
const stream = await fetch(`/api/incidents/${id}/events?after=0`, { signal: AbortSignal.timeout(5000) });
assert.match(stream.headers.get('content-type') || '', /text\/event-stream/);
const reader = stream.body!.getReader();
let text = '';
while (!text.includes('\n\n')) {
  const chunk = await reader.read();
  if (chunk.done) break;
  text += new TextDecoder().decode(chunk.value);
}
await reader.cancel();
assert.match(text, /event: snapshot.updated/);
const dataLine = text.split('\n').find(line => line.startsWith('data: '));
assert.ok(dataLine);
assert.equal(snapshotSchema.parse(JSON.parse(dataLine.slice(6)).snapshot).incidentId, id);
snapshot = await api.snapshot(id);
const voiceId = randomUUID();
await api.transcript(id, 'SYNTHETIC UPDATE: the site medic is reported en route; external emergency contact remains unconfirmed.', snapshot.version, voiceId);
let voice = await api.transcriptStatus(voiceId);
for (let attempt = 0; voice.status === 'pending' && attempt < 100; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 100));
  voice = await api.transcriptStatus(voiceId);
}
assert.equal(voice.status, 'delivered');
assert.ok((await api.details(id)).messages.some(message => message.text.startsWith('SYNTHETIC UPDATE:')));
const usage = await (await fetch('/api/usage')).json();
console.log('PASS: frontend proxy, private session, persisted incident, five agent views, owned tasks, sources, stale rejection, queued answer, report download, SSE replay and reviewed update relay.');
console.log(`Offline rehearsal saved: ${id}. Provider usage: ${JSON.stringify(usage.providers)}`);
