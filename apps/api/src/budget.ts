import { randomUUID } from 'node:crypto';
import { Store } from './store.js';
export type UsageEntry = { id: string; provider: 'openrouter' | 'exa'; reserved: number; reportedCost?: number; unknownCost: boolean; state: 'pending' | 'done' | 'failed'; tokens?: number; timestamp: string };
export class Budget {
  constructor(private store: Store) {}
  entries() { return this.store.list<UsageEntry>('usage'); }
  summary() {
    return (['openrouter', 'exa'] as const).map(provider => {
      const rows = this.entries().filter(e => e.provider === provider);
      return { provider, calls: rows.length, reportedUsd: rows.reduce((s, e) => s + (e.reportedCost ?? 0), 0), accountedUsd: rows.reduce((s, e) => s + (e.reportedCost ?? e.reserved), 0), unknownCosts: rows.filter(e => e.unknownCost).length };
    });
  }
  reserve(provider: UsageEntry['provider'], callLimit: number, amount: number, budget: number) {
    const usage = this.summary().find(p => p.provider === provider)!;
    if (usage.calls >= callLimit || usage.accountedUsd + amount > budget + 1e-9) throw new Error(`${provider} configured usage limit reached`);
    const entry: UsageEntry = { id: `usage-${randomUUID()}`, provider, reserved: amount, unknownCost: true, state: 'pending', timestamp: new Date().toISOString() };
    this.store.transaction(() => this.store.put(entry.id, 'usage', entry)); return entry.id;
  }
  finish(id: string, state: 'done' | 'failed', cost?: number, tokens?: number) {
    const e = this.store.get<UsageEntry>(id)!; e.state = state;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) { e.reportedCost = cost; e.unknownCost = false; }
    e.tokens = tokens; this.store.transaction(() => this.store.put(id, 'usage', e));
  }
}
