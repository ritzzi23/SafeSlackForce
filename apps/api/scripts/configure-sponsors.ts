import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Local, explicit credential provisioning. Never log extracted values or commit .env.
const source = process.argv[2];
if (!source) throw new Error('Usage: npm run configure:sponsors -- /private/path/sponsor-credits.md');
execFileSync('git', ['check-ignore', '--quiet', '.env']);
if (existsSync('.env')) throw new Error('.env already exists; refusing to overwrite local configuration');
const notes = readFileSync(source, 'utf8');
const exaSection = notes.split(/###\s+Exa[^\n]*\n/i)[1]?.split(/\n---/)[0] ?? '';
const exaLine = exaSection.split('\n').find(line => /API\s+key/i.test(line));
const exa = exaLine?.match(/`([A-Za-z0-9_-]{16,})`/)?.[1];
const values: Record<string, string> = {
  DASHBOARD_TOKEN: randomBytes(32).toString('hex'),
  ...(exa ? { EXA_API_KEY: exa, EXA_ENABLED: 'true' } : {}),
};
for (const [name, pattern] of Object.entries({ OPENROUTER_API_KEY: /\bsk-or-v1-[A-Za-z0-9_-]+\b/,
  SLACK_BOT_TOKEN: /\bxoxb-[A-Za-z0-9-]+\b/, SLACK_APP_TOKEN: /\bxapp-[A-Za-z0-9-]+\b/ })) {
  const match = notes.match(pattern); if (match) values[name] = match[0];
}
let template = readFileSync('.env.example', 'utf8');
for (const [name, value] of Object.entries(values)) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Invalid credential format for ${name}`);
  template = template.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
}
writeFileSync('.env', template, { flag: 'wx', mode: 0o600 });
console.log('Created private, gitignored .env; fixture mode retained. Values were not printed.');
console.log('Configured:', Object.keys(values).join(', '));
console.log('OpenRouter/Slack redemption codes are not used as API credentials. Run npm run doctor for missing settings.');
