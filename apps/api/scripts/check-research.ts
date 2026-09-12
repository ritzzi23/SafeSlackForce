import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Budget } from '../src/budget.js';
import { Research } from '../src/research.js';

// One useful public-reference search, using the same cache and persistent budget as the app.
const config = readConfig();
if (!config.exaEnabled || !config.exaKey) throw new Error('Configure Exa first');
const store = await Store.open(config.database);
try {
  const research = new Research(config, new Budget(store), store);
  const result = await research.search('incident-documentation');
  console.log(JSON.stringify({ verified: true, cached: result.cached, resultCount: result.results.length,
    sources: result.results.map((r: any) => ({ title: r.title, url: r.url })),
    usage: new Budget(store).summary().find(p => p.provider === 'exa') }, null, 2));
} catch (e) {
  console.error(e instanceof Error && /^Exa returned HTTP \d+$/.test(e.message) ? e.message : 'Exa check failed; no credential values printed');
  process.exitCode = 1;
} finally { store.close(); }
