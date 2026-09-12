import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Budget } from '../src/budget.js';
import { OpenRouter } from '../src/model.js';
import { Research } from '../src/research.js';

const config = () => readConfig({ DASHBOARD_TOKEN: 'test-only-provider-token-123456789',
  OPENROUTER_API_KEY: 'test-key-not-real', INCIDENTOS_MODEL: 'test-model-not-real',
  MODEL_BUDGET_USD: '0.10', MODEL_CALL_RESERVE_USD: '0.05',
  EXA_API_KEY: 'test-key-not-real', EXA_ENABLED: 'true', EXA_CALL_LIMIT: '1' });

test('OpenRouter keeps unknown charges reserved and stops before another network request', async () => {
  const store = await Store.open(':memory:'); const budget = new Budget(store);
  const provider = new OpenRouter(config(), budget); const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    assert.equal(body.max_tokens, 1000);
    assert.equal(body.model, 'test-model-not-real');
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Test response' } }] }), { status: 200 });
  };
  try {
    await provider.complete([{ role: 'user', content: 'Synthetic test' }], []);
    await provider.complete([{ role: 'user', content: 'Synthetic test' }], []);
    await assert.rejects(provider.complete([{ role: 'user', content: 'Synthetic test' }], []), /usage limit/);
    assert.equal(calls, 2); assert.equal(budget.summary()[0].accountedUsd, 0.1);
    assert.equal(budget.summary()[0].unknownCosts, 2);
  } finally { globalThis.fetch = original; store.close(); }
});

test('OpenRouter records provider-reported cost and does not automatically retry failures', async () => {
  const store = await Store.open(':memory:'); const budget = new Budget(store);
  const provider = new OpenRouter(config(), budget); const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({ choices: [{ message: { content: 'Test' } }], usage: { cost: 0.002, total_tokens: 30 } }))
      : new Response('Unavailable', { status: 503 });
  };
  try {
    await provider.complete([], []);
    await assert.rejects(provider.complete([], []), /HTTP 503/);
    assert.equal(calls, 2); assert.equal(budget.summary()[0].reportedUsd, 0.002);
    assert.equal(budget.summary()[0].accountedUsd, 0.052000000000000005);
    assert.equal(budget.entries()[1].state, 'failed');
  } finally { globalThis.fetch = original; store.close(); }
});

test('Exa caches generic queries, filters sources and enforces attempted-call cap', async () => {
  const store = await Store.open(':memory:'); const budget = new Budget(store);
  const research = new Research(config(), budget, store); const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++; const body = JSON.parse(init!.body as string);
    assert.equal(body.numResults, 3);
    assert.equal(body.query, 'site:osha.gov incident investigation documentation witness statements');
    return new Response(JSON.stringify({ results: [
      { url: 'https://www.osha.gov/incident-investigation', title: 'Reference', text: 'Synthetic excerpt' },
      { url: 'https://unapproved.example/claims', title: 'Exclude' },
    ], costDollars: { total: 0.01 } }));
  };
  try {
    const first = await research.search('incident-documentation');
    assert.equal(first.results.length, 1); assert.equal(first.cached, false);
    assert.equal((await research.search('incident-documentation')).cached, true);
    await assert.rejects(research.search('handoff-communication'), /usage limit/);
    assert.equal(calls, 1);
    const disabled = new Research({ ...config(), exaEnabled: false }, budget, store);
    await assert.rejects(disabled.search('handoff-communication'), /disabled/);
  } finally { globalThis.fetch = original; store.close(); }
});

test('blank Slack IDs in environment template resolve to fixture identities', () => {
  const result = readConfig({ DASHBOARD_TOKEN: 'test-only-provider-token-123456789', SLACK_LEAD_USER_ID: '',
    SLACK_BACKUP_USER_ID: '', SLACK_SUPERVISOR_USER_IDS: '', SLACK_TEAM_ID: '', SLACK_DEMO_CHANNEL_ID: '' });
  assert.equal(result.lead, 'ULEAD'); assert.deepEqual(result.supervisors, ['USUPERVISOR']);
});
