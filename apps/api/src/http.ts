import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { agentIdSchema, questionSchema, type QuestionResult, type StreamUpdate } from '@safeslackforce/contracts';
import { Agents } from './agents.js';
import { Budget } from './budget.js';
import { DomainError, Incidents } from './domain.js';
import { Research, researchTopic } from './research.js';
import { FixtureChannel } from './notifications.js';
import type { Media } from './media.js';
import { officeCategory } from './office.js';
import { COPILOT_ENDPOINT, copilotHandler } from './copilot.js';
/** Paired dashboards stay signed in for a week; restarts keep sessions (see below). */
const SESSION_MS = 7 * 24 * 3600000;
type SavedRequest = QuestionResult & { incidentId: string; agentId: string; text: string };
export function createHttp(domain: Incidents, agents: Agents, budget: Budget, research: Research, media?: Media) {
  const app = express();
  // Sessions persist in SQLite (hashed ids only) so an API restart does not force re-pairing.
  // Rotating DASHBOARD_TOKEN invalidates every stored session.
  const digest = (v: string) => createHash('sha256').update(v).digest('hex');
  const tokenId = digest(domain.config.token).slice(0, 16);
  const sessions = {
    get: (id: string) => { const r = domain.store.get<{ expires: number; tokenId: string }>(`session-${digest(id)}`); return r && r.tokenId === tokenId ? r.expires : undefined; },
    set: (id: string, expires: number) => domain.store.transaction(() => domain.store.put(`session-${digest(id)}`, 'session', { expires, tokenId })),
    delete: (id: string) => domain.store.transaction(() => domain.store.put(`session-${digest(id)}`, 'session', { expires: 0, tokenId })),
  };
  app.disable('x-powered-by');
  // CopilotKit reads its own request stream, so the JSON parser must not consume it first.
  const json = express.json({ limit: '64kb' });
  app.use((req, res, next) => req.path.startsWith(COPILOT_ENDPOINT) ? next() : json(req, res, next));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (origin && !domain.config.origins.includes(origin)) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; } next();
  });
  const equal = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  const sessionOf = (req: express.Request) => /(?:^|;\s*)safeslackforce_session=([a-f0-9]+)/.exec(req.headers.cookie ?? '')?.[1];
  app.get('/health', (_req, res) => res.json({ ok: true, mode: domain.config.mode, slack: domain.connection, modelConfigured: Boolean(domain.config.apiKey && domain.config.model), ambiguousWorkspace: Boolean(domain.config.ambiguousEnabled && domain.config.ambiguousKey) }));
  app.post('/api/session', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!equal(token, domain.config.token)) { res.status(401).json({ error: 'Invalid pairing token' }); return; }
    const session = randomBytes(32).toString('hex'); sessions.set(session, Date.now() + SESSION_MS);
    res.cookie('safeslackforce_session', session, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_MS });
    res.json({ paired: true, role: 'demo-coordinator', mode: domain.config.mode });
  });
  app.use('/api', (req, res, next) => {
    const session = sessionOf(req);
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    if ((session && (sessions.get(session) ?? 0) > Date.now()) || (bearer && equal(bearer, domain.config.token))) next();
    else res.status(401).json({ error: 'Pair the dashboard using POST /api/session' });
  });
  const copilot = copilotHandler(domain.config);
  app.use((req, res, next) => {
    if (!req.path.startsWith(COPILOT_ENDPOINT)) { next(); return; }
    if (!copilot) { res.status(503).json({ error: 'Copilot needs OPENROUTER_API_KEY and SAFESLACKFORCE_MODEL' }); return; }
    copilot(req, res, next);
  });
  app.post('/api/logout', (req, res) => { const session = sessionOf(req); if (session) sessions.delete(session); res.clearCookie('safeslackforce_session'); res.json({ ok: true }); });
  const wrap = (handler: (req: express.Request<Record<string, string>>, res: express.Response) => unknown | Promise<unknown>): express.RequestHandler<Record<string, string>> => (req, res, next) => { Promise.resolve().then(() => handler(req, res)).catch(next); };
  app.get('/api/incidents', (_req, res) => res.json(domain.all().map(i => ({ incidentId: i.snapshot.incidentId, title: i.snapshot.title, status: i.snapshot.status }))));
  app.get('/api/office', wrap((_req, res) => {
    if (!domain.office) throw new DomainError(503, 'Office demo database is disabled. Seed it and enable OFFICE_DEMO_ENABLED.');
    return res.json(domain.office.summary());
  }));
  app.get('/api/office/records', wrap((req, res) => {
    if (!domain.office) throw new DomainError(503, 'Office demo database is disabled.');
    const query = z.object({ category: officeCategory.optional(), query: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(20).optional() }).strict().parse(req.query);
    return res.json(domain.office.search(query));
  }));
  app.get('/api/incidents/:id', wrap((req, res) => res.json(domain.get(req.params.id).snapshot)));
  app.get('/api/incidents/:id/readiness', wrap((req, res) => res.json(domain.readiness(req.params.id))));
  app.post('/api/incidents/:id/response', wrap(async (req, res) => {
    const id = req.params.id;
    return res.json(await agents.enqueue(id, () => agents.response.run(id, req.body)));
  }));
  app.get('/api/incidents/:id/details', wrap((req, res) => { const i = domain.get(req.params.id); return res.json({ facts: i.facts, messages: i.messages, notifications: i.notifications, attachments: i.attachments ?? [], summaryDelivery: domain.store.get(`summary-${req.params.id}`) ?? null }); }));
  app.get('/api/incidents/:id/attachments/:fileId', wrap((req, res) => {
    if (!media) throw new DomainError(404, 'Media not configured');
    const { file, bytes } = media.get(req.params.id, req.params.fileId);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.type(file.mimetype).send(bytes);
  }));
  app.get('/api/usage', (_req, res) => res.json({ providers: budget.summary(), limits: { modelCalls: domain.config.callLimit, modelAccountedUsd: domain.config.modelBudget, callReservationUsd: domain.config.callReserve, exaCalls: domain.config.exaCallLimit }, note: 'Unknown costs retain reservations. Provider-side key limits are required for a strict billing cap.' }));
  app.post('/api/research', wrap(async (req, res) => res.json(await research.search(researchTopic.parse(req.body.topic)))));
  app.get('/api/incidents/:id/events', wrap((req, res) => {
    const id = req.params.id; const snapshot = domain.get(id).snapshot;
    const raw = req.query.after ?? String(req.headers['last-event-id'] ?? '').split(':').at(-1) ?? 0;
    const after = z.coerce.number().int().nonnegative().parse(raw || 0);
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Connection', 'keep-alive'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders();
    // Proxies may hold headers until the first body chunk, even after flushHeaders.
    res.write(': connected\n\n');
    let cursor = after > snapshot.cursor ? 0 : after;
    const send = (event: StreamUpdate) => {
      if (event.snapshot.incidentId !== id || event.cursor <= cursor) return;
      cursor = event.cursor; res.write(`id: ${event.eventId}\nevent: snapshot.updated\ndata: ${JSON.stringify(event)}\n\n`);
    };
    // Replay and listener installation are synchronous in this process, with no await gap.
    if (after > snapshot.cursor) send({ eventId: `${id}:${snapshot.cursor}`, cursor: snapshot.cursor, kind: 'snapshot.updated', snapshot });
    else for (const event of domain.store.events(id, after)) send(event);
    domain.bus.on('update', send);
    const timer = setInterval(() => {
      const session = sessionOf(req);
      if (session && (sessions.get(session) ?? 0) <= Date.now()) { res.end(); return; }
      res.write(': heartbeat\n\n');
    }, 15000);
    res.on('close', () => { clearInterval(timer); domain.bus.off('update', send); });
  }));
  app.post('/api/incidents/:id/agents/:agentId/questions', wrap((req, res) => {
    const id = req.params.id; const agent = agentIdSchema.parse(req.params.agentId); const input = questionSchema.parse(req.body);
    const key = `request-${input.requestId}`; const prior = domain.store.get<SavedRequest>(key);
    if (prior) {
      if (prior.incidentId !== id || prior.agentId !== agent || prior.text !== input.text) throw new DomainError(409, 'Request ID already used for different content');
      return res.status(prior.status === 'pending' ? 202 : 200).json({ requestId: input.requestId, status: prior.status });
    }
    if (domain.get(id).snapshot.version !== input.expectedVersion) throw new DomainError(409, 'Incident changed; refresh before asking');
    const record: SavedRequest = { requestId: input.requestId, incidentId: id, agentId: agent, text: input.text, status: 'pending' };
    domain.store.transaction(() => domain.store.put(key, 'request', record));
    void agents.enqueue(id, async () => {
      try {
        const receipt = await agents.notifications.channel.send(domain.get(id), `[Dashboard coordinator → ${agent}] ${input.text.replace(/[<>]/g, '')}`);
        domain.mutate(id, `Dashboard question to ${agent}: ${input.text}`, () => [{ id: receipt, label: 'Dashboard question relayed by bot', kind: 'tool_result' }]);
        record.answer = await agents.run(id, agent, input.text); record.status = 'done';
        record.sources = domain.get(id).snapshot.agents.find(a => a.id === agent)!.sources;
        if (domain.get(id).snapshot.agents.find(a => a.id === agent)!.status === 'failed') { record.status = 'failed'; record.error = 'Some agent tools failed; inspect the partial answer and activity'; }
        const answerReceipt = await agents.notifications.channel.send(domain.get(id), `[${agent}] ${record.answer.replace(/[<>]/g, '').slice(0, 2500)}`);
        domain.mutate(id, `${agent} answered dashboard question: ${record.answer}`, () => [...(record.sources ?? []), { id: answerReceipt, kind: 'tool_result', label: 'Agent answer delivered to Slack' }]);
      } catch { record.status = 'failed'; record.error = 'Agent or Slack delivery failed; inspect incident activity.'; }
      domain.store.transaction(() => domain.store.put(key, 'request', record));
    }).catch(() => {});
    return res.status(202).json({ requestId: input.requestId, status: 'pending' });
  }));
  app.get('/api/requests/:requestId', wrap((req, res) => {
    const r = domain.store.get<SavedRequest>(`request-${req.params.requestId}`); if (!r) throw new DomainError(404, 'Request not found'); return res.json(r);
  }));
  app.post('/api/incidents/:id/transcripts', wrap((req, res) => {
    const id = req.params.id;
    const input = questionSchema.extend({ confirmed: z.literal(true) }).parse(req.body);
    const key = `transcript-${input.requestId}`;
    const prior = domain.store.get<{ incidentId: string; text: string; status: string }>(key);
    if (prior) {
      if (prior.incidentId !== id || prior.text !== input.text) throw new DomainError(409, 'Transcript request ID already used');
      return res.status(prior.status === 'pending' ? 202 : 200).json(prior);
    }
    const i = domain.get(id);
    if (i.snapshot.status === 'closed' || i.demoArchived) throw new DomainError(409, 'Incident closed or archived');
    if (i.snapshot.version !== input.expectedVersion) throw new DomainError(409, 'Incident changed; review transcript again');
    const record = { incidentId: id, text: input.text, status: 'pending', error: '', requestId: input.requestId };
    domain.store.transaction(() => domain.store.put(key, 'transcript', record));
    void agents.enqueue(id, async () => {
      try {
        if (domain.get(id).snapshot.version !== input.expectedVersion) throw new DomainError(409, 'Incident changed before transcript dispatch; review again');
        const receipt = await agents.notifications.channel.send(domain.get(id), `[Dashboard coordinator: reviewed voice transcript]\n${input.text.replace(/[<>]/g, '')}`);
        domain.addMessage(id, { ts: receipt, text: input.text, user: 'demo-coordinator', origin: 'confirmed_transcript' });
        record.status = 'delivered'; domain.store.transaction(() => domain.store.put(key, 'transcript', record));
        await agents.coordinate(id, 'A coordinator reviewed and relayed an update into Slack. Read the incident and coordinate its new information, including the Evidence review. Treat it as reported information, not confirmation of completed physical actions.');
      } catch (e) { record.status = record.status === 'delivered' ? 'delivered_agent_failed' : e instanceof DomainError && e.status === 409 ? 'stale' : 'uncertain'; record.error = 'Inspect incident and Slack before resubmitting; no automatic retry'; }
      domain.store.transaction(() => domain.store.put(key, 'transcript', record));
    }).catch(() => {});
    return res.status(202).json(record);
  }));
  app.get('/api/transcripts/:requestId', wrap((req, res) => {
    const value = domain.store.get(`transcript-${req.params.requestId}`); if (!value) throw new DomainError(404, 'Transcript not found'); return res.json(value);
  }));
  app.get('/api/incidents/:id/reports/:reportId', wrap((req, res) => {
    const r = domain.store.get<{ incidentId: string; markdown: string }>(req.params.reportId);
    if (!r || r.incidentId !== req.params.id) throw new DomainError(404, 'Report not found');
    res.setHeader('Content-Disposition', 'attachment; filename="incident-handoff.md"'); return res.type('text/markdown').send(r.markdown);
  }));
  if (domain.config.mode === 'fixture') {
    app.post('/api/demo/reset', wrap((req, res) => {
      z.object({ confirmation: z.literal('ARCHIVE FIXTURE INCIDENTS') }).parse(req.body);
      if (agents.busy) throw new DomainError(409, 'Wait for queued agents before resetting');
      const ids = domain.all().filter(i => i.snapshot.mode === 'fixture').map(i => i.snapshot.incidentId);
      for (const id of ids) domain.mutate(id, 'Fixture archived for fresh rehearsal; history and budget preserved', i => { i.demoArchived = true; });
      return res.json({ archived: ids, usagePreserved: true });
    }));
    app.post('/api/demo/incidents', wrap(async (req, res) => {
      const input = z.object({ text: z.string().min(1).max(4000), ts: z.string().optional() }).parse(req.body);
      const i = domain.create({ team: domain.config.team, channel: domain.config.channel, ts: input.ts ?? `${Date.now()}.000001`, user: 'UREPORTER', text: input.text });
      await agents.process(i.snapshot.incidentId); return res.status(201).json(domain.get(i.snapshot.incidentId).snapshot);
    }));
    app.post('/api/demo/incidents/:id/messages', wrap((req, res) => {
      const data = z.object({ text: z.string().max(4000), user: z.string().min(1), ts: z.string(), deleted: z.boolean().optional() }).parse(req.body);
      domain.addMessage(req.params.id, data); return res.json(domain.get(req.params.id).snapshot);
    }));
    app.post('/api/demo/incidents/:id/tasks/:taskId/action', wrap((req, res) => {
      const data = z.object({ actor: z.string(), action: z.enum(['acknowledge', 'complete', 'review']), version: z.number(), note: z.string().default('') }).parse(req.body);
      return res.json(domain.confirm(req.params.id, req.params.taskId, data.actor, data.action, data.version, data.note).snapshot);
    }));
    app.post('/api/demo/incidents/:id/report', wrap((req, res) => { const i = domain.get(req.params.id); return res.json(domain.report(req.params.id, 'Synthetic fixture handoff', [i.messages[0].source.id])); }));
    app.post('/api/demo/incidents/:id/handoff', wrap((req, res) => {
      const data = z.object({ actor: z.string(), version: z.number() }).parse(req.body); return res.json(domain.handoff(req.params.id, data.actor, data.version).snapshot);
    }));
    app.get('/api/demo/outbox', (_req, res) => res.json((agents.notifications.channel as FixtureChannel).sent));
  }
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) { res.end(); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid request', issues: error.issues }); return; }
    if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON' }); return; }
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Request body too large' }); return; }
    res.status(error instanceof DomainError ? error.status : 500).json({ error: error instanceof DomainError ? error.message : 'Request failed' });
  });
  return app;
}
