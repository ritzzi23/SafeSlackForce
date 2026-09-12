import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Budget } from '../src/budget.js';
import { OpenRouter, type ModelMessage, type ToolSpec } from '../src/model.js';

// Explicit paid smoke test: two model calls maximum, separate persistent $0.02
// allowance. Does not create an incident or impersonate a human acknowledgement.
const config = readConfig();
assert.equal(config.mode, 'live');
const health = await (await fetch(`http://127.0.0.1:${config.port}/health`)).json() as any;
assert.equal(health.slack, 'connected'); assert.equal(health.modelConfigured, true);
const store = await Store.open('data/provider-check.sqlite');
const budget = new Budget(store);
try {
  const model = new OpenRouter({ ...config, callLimit: 2, modelBudget: 0.02, callReserve: 0.01 }, budget);
  const tools: ToolSpec[] = [{ type: 'function', function: { name: 'read_runtime_status', description: 'Read actual local backend health. Call once before answering.', parameters: { type: 'object', properties: {}, additionalProperties: false, required: [] } } }];
  const messages: ModelMessage[] = [{ role: 'system', content: 'You are testing a software connection, not an emergency. First call read_runtime_status exactly once. After the tool returns, briefly summarize whether the runtime is live and Slack connected. Do not call any other tools.' }, { role: 'user', content: 'Verify the runtime connection.' }];
  const first = await model.complete(messages, tools);
  assert.equal(first.tool_calls?.length, 1);
  const call = first.tool_calls![0]; assert.equal(call.function.name, 'read_runtime_status');
  messages.push({ role: 'assistant', content: first.content, tool_calls: first.tool_calls });
  messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(health) });
  const second = await model.complete(messages, tools);
  assert.ok(second.content?.trim()); assert.ok(!second.tool_calls?.length);
  console.log('PASS: real model tool selection, actual local health tool result, and final model response.');
  console.log(JSON.stringify(budget.summary()));
  if (process.argv.includes('--send-slack-test')) {
    const r = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${config.botToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: config.channel, text: 'SafeSlackForce integration check — DEMO ONLY, not an incident. Live backend and Slack Socket Mode are connected. The model tool-call check passed. To start a synthetic rehearsal, mention this bot in a NEW channel message: “SYNTHETIC DEMO: Forklift incident at Loading Dock B. One person is reported injured. No actions are confirmed yet.” Human acknowledgements must be made by the actual participants.' }) });
    const data = await r.json() as any;
    assert.ok(r.ok && data.ok && data.ts, `Slack check message failed: ${data.error || r.status}`);
    console.log('PASS: Slack confirmed delivery of the labelled connection-check message.');
  }
} finally { store.close(); }
