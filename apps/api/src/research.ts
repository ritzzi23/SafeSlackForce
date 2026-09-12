import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Budget } from './budget.js';
import { Store } from './store.js';
import type { Config } from './config.js';
export const researchTopic = z.enum(['incident-documentation', 'handoff-communication']);
const queries = {
  'incident-documentation': 'site:osha.gov incident investigation documentation witness statements',
  'handoff-communication': 'site:ready.gov business emergency communication plan roles responsibilities',
};
export class Research {
  constructor(private config: Config, private budget: Budget, private store: Store) {}
  async search(topic: z.infer<typeof researchTopic>) {
    const query = queries[topic];
    const key = `research-${createHash('sha256').update(query).digest('hex')}`;
    const cached = this.store.get<{ fetchedAt: number; results: unknown[] }>(key);
    if (cached && Date.now() - cached.fetchedAt < 86400000) return { ...cached, cached: true };
    if (!this.config.exaEnabled || !this.config.exaKey) throw new Error('Exa research is disabled or not configured');
    const reservation = this.budget.reserve('exa', this.config.exaCallLimit, 0, Number.POSITIVE_INFINITY);
    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'x-api-key': this.config.exaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: 'auto', numResults: 3, includeDomains: ['osha.gov', 'ready.gov'], contents: { text: { maxCharacters: 1200 } } }),
      });
      if (!response.ok) throw new Error(`Exa returned HTTP ${response.status}`);
      const payload = await response.json() as { results: { title?: string; url: string; text?: string }[]; costDollars?: { total?: number } };
      if (!Array.isArray(payload.results)) throw new Error('Invalid Exa results');
      const results = payload.results.filter(r => { try { const u = new URL(r.url); return u.protocol === 'https:' && ['osha.gov', 'ready.gov'].some(d => u.hostname === d || u.hostname.endsWith(`.${d}`)); } catch { return false; } }).slice(0, 3).map(r => ({ title: r.title, url: r.url, excerpt: r.text?.slice(0, 1200), status: 'public reference; requires human review, not a site procedure' }));
      const value = { fetchedAt: Date.now(), results };
      this.store.transaction(() => this.store.put(key, 'research', value));
      this.budget.finish(reservation, 'done', payload.costDollars?.total); return { ...value, cached: false };
    } catch (error) { this.budget.finish(reservation, 'failed'); throw error; }
  }
}
