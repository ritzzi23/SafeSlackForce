import test from 'node:test';
import assert from 'node:assert/strict';
import { Incidents } from '../src/domain.js';
import { Store } from '../src/store.js';
import { readConfig } from '../src/config.js';

async function setup() {
  const store = await Store.open(':memory:');
  const domain = new Incidents(store, readConfig({ DASHBOARD_TOKEN: 'summary-regression-fixture-token', AUTONOMOUS_RESPONSE_ENABLED: 'true' }));
  const id = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'SYNTHETIC forklift incident at Dock B' }).snapshot.incidentId;
  domain.applyProcedure(id);
  for (const agent of ['procedure', 'evidence'] as const) domain.agent(id, agent, 'done', 'The lead has not accepted ownership. Backup reminders are outstanding.');
  return { store, domain, id };
}

test('human ownership, review, completion, handoff and closure update current summaries without rewriting evidence', async () => {
  const { store, domain, id } = await setup();
  try {
    domain.mutate(id, 'Persist evidence before human actions', i => {
      i.facts.push({ id: 'fact', text: 'Reported incident at Dock B', state: 'reported', sourceIds: ['100.1'] });
      i.evidenceReview = { sourceIds: ['100.1'], noObservationsReason: null };
      i.coordinationFailures = [];
    });
    const before = domain.get(id);
    const specialists = () => domain.get(id).snapshot.agents.filter(a => ['procedure', 'evidence'].includes(a.id));
    domain.acceptAssigned(id, 'ULEAD', before.snapshot.version);
    for (const agent of specialists()) {
      assert.match(agent.summary, /3 acknowledged/);
      assert.doesNotMatch(agent.summary, /has not accepted|Backup reminders/);
      assert.equal(agent.status, 'waiting');
      assert.ok(agent.sources.some(s => s.kind === 'human_confirmation'));
    }
    domain.confirm(id, 'area', 'ULEAD', 'review', 2, 'Synthetic observation needs review');
    for (const agent of specialists()) {
      assert.match(agent.summary, /1 needs review/);
      assert.equal(agent.status, 'blocked');
      assert.equal(agent.waitingOn, agent.summary);
    }
    for (const task of domain.get(id).snapshot.tasks) domain.confirm(id, task.id, 'ULEAD', 'complete', task.version, 'Explicit synthetic confirmation; no physical work asserted');
    for (const agent of specialists()) {
      assert.match(agent.summary, /3 completed/);
      assert.equal(agent.status, 'done');
      assert.equal(agent.waitingOn, null);
    }
    domain.report(id, 'All synthetic confirmations recorded', ['100.1']);
    domain.handoff(id, 'USUPERVISOR', domain.get(id).snapshot.version);
    for (const agent of specialists()) assert.match(agent.summary, /Incident: handed over/);
    assert.match(domain.get(id).snapshot.agents[0].summary, /Handoff accepted/);
    domain.close(id, 'USUPERVISOR', domain.get(id).snapshot.version, 'Synthetic software rehearsal complete');
    const closed = domain.get(id);
    for (const agent of specialists()) assert.match(agent.summary, /Incident: closed/);
    assert.match(closed.snapshot.agents[0].summary, /Incident closed/);
    assert.doesNotMatch(closed.snapshot.agents[0].summary, /coordination active|continue without/);
    assert.deepEqual(closed.messages, before.messages);
    assert.deepEqual(closed.facts, before.facts);
    assert.deepEqual(closed.evidenceReview, before.evidenceReview);
    assert.deepEqual(closed.snapshot.activity.slice(0, before.snapshot.activity.length), before.snapshot.activity);
    assert.ok(closed.snapshot.activity.some(a => a.text.includes('The lead has not accepted ownership.')));
  } finally { store.close(); }
});

test('a late specialist result cannot undo a human update, while fresh runs and actual failures remain visible', async () => {
  const { store, domain, id } = await setup();
  try {
    domain.agent(id, 'procedure', 'working', 'Read assigned task ownership');
    domain.agent(id, 'evidence', 'working', 'Review current evidence');
    domain.confirm(id, 'lead', 'USUPERVISOR', 'acknowledge', 1, 'Supervisor accepted this synthetic task');
    assert.equal(domain.get(id).snapshot.tasks[0].owner?.slackUserId, 'USUPERVISOR');
    assert.equal(domain.get(id).snapshot.agents.find(a => a.id === 'procedure')!.status, 'working');
    domain.agent(id, 'procedure', 'waiting', 'The lead has not accepted ownership; follow-up requested.');
    assert.doesNotMatch(domain.get(id).snapshot.agents.find(a => a.id === 'procedure')!.summary, /has not accepted/);
    domain.agent(id, 'procedure', 'done', 'The lead has not accepted ownership.');
    domain.agent(id, 'evidence', 'failed', 'The lead has not accepted ownership; tool failed.');
    const current = domain.get(id);
    for (const a of current.snapshot.agents.filter(a => ['procedure', 'evidence'].includes(a.id))) {
      assert.match(a.summary, /1 acknowledged/);
      assert.doesNotMatch(a.summary, /has not accepted/);
    }
    assert.equal(current.snapshot.agents.find(a => a.id === 'evidence')!.status, 'failed');
    assert.match(current.snapshot.agents.find(a => a.id === 'evidence')!.summary, /Specialist run failed/);
    domain.agent(id, 'procedure', 'working', 'Read the updated ownership');
    domain.agent(id, 'procedure', 'done', 'The supervisor has now accepted the lead task.');
    assert.equal(domain.get(id).snapshot.agents.find(a => a.id === 'procedure')!.summary, 'The supervisor has now accepted the lead task.');
  } finally { store.close(); }
});

test('explicit refresh repairs legacy current summaries and excludes deleted sources without synthesizing human actions', async () => {
  const { store, domain, id } = await setup();
  try {
    domain.addMessage(id, { ts: '200.1', text: 'Unverified lead observation', user: 'UREPORTER' });
    domain.addMessage(id, { ts: '200.1', text: 'Unverified lead observation', user: 'UREPORTER', deleted: true, revision: '201.1' });
    for (const task of domain.get(id).snapshot.tasks) domain.confirm(id, task.id, 'ULEAD', 'complete', task.version, 'Synthetic confirmation');
    domain.report(id, 'Synthetic report', ['100.1']);
    domain.handoff(id, 'USUPERVISOR', domain.get(id).snapshot.version);
    domain.close(id, 'USUPERVISOR', domain.get(id).snapshot.version, 'Synthetic closure');
    const legacy = domain.get(id);
    delete legacy.humanRevision; delete legacy.specialistRunRevisions; delete legacy.coordinationFailures;
    for (const agent of legacy.snapshot.agents.filter(a => ['commander', 'procedure', 'evidence'].includes(a.id))) {
      agent.summary = 'The lead has not accepted ownership. Autonomous coordination active.';
      agent.sources = legacy.messages.filter(m => m.deleted).map(m => m.source);
    }
    store.transaction(() => store.put(id, 'incident', legacy));
    const refreshed = domain.refreshCurrentSummaries(id);
    assert.equal(refreshed.snapshot.status, 'closed');
    assert.equal(refreshed.humanRevision, undefined);
    assert.deepEqual(refreshed.messages, legacy.messages);
    assert.deepEqual(refreshed.facts, legacy.facts);
    assert.deepEqual(refreshed.snapshot.tasks, legacy.snapshot.tasks);
    assert.deepEqual(refreshed.snapshot.reports, legacy.snapshot.reports);
    assert.deepEqual(refreshed.snapshot.activity.slice(0, -1), legacy.snapshot.activity);
    assert.deepEqual(refreshed.snapshot.activity.at(-1)!.sources, []);
    for (const a of refreshed.snapshot.agents.filter(a => ['procedure', 'evidence'].includes(a.id))) {
      assert.match(a.summary, /3 completed.*Incident: closed/);
      assert.ok(a.sources.every(s => !legacy.messages.some(m => m.deleted && m.source.id === s.id)));
    }
    assert.match(refreshed.snapshot.agents[0].summary, /Incident closed/);
  } finally { store.close(); }
});
