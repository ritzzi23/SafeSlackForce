import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/config.js';

const token = 'test-only-branding-config-token-12345678';

test('new configuration names take precedence while existing deployments remain compatible', () => {
  const legacy = { DASHBOARD_TOKEN: token, INCIDENTOS_MODE: 'live', INCIDENTOS_MODEL: 'legacy-model' };
  assert.equal(readConfig(legacy).mode, 'live');
  assert.equal(readConfig(legacy).model, 'legacy-model');
  const current = readConfig({ ...legacy, SAFESLACKFORCE_MODE: 'fixture', SAFESLACKFORCE_MODEL: 'current-model' });
  assert.equal(current.mode, 'fixture');
  assert.equal(current.model, 'current-model');
});

test('branding changes preserve the existing database instead of resetting history and spending', () => {
  const previous = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), 'safeslackforce-config-'));
  try {
    process.chdir(directory);
    mkdirSync('data');
    const env = { DASHBOARD_TOKEN: token, SAFESLACKFORCE_MODE: 'live' };
    assert.equal(readConfig(env).database, 'data/safeslackforce-live.sqlite');
    writeFileSync('data/incidentos-live.sqlite', 'existing incident and budget data');
    assert.equal(readConfig(env).database, 'data/incidentos-live.sqlite');
    assert.equal(readFileSync(readConfig(env).database, 'utf8'), 'existing incident and budget data');
    assert.equal(readConfig({ ...env, DATABASE_PATH: 'custom.sqlite' }).database, 'custom.sqlite');
    writeFileSync('data/safeslackforce-live.sqlite', 'new database');
    assert.equal(readConfig(env).database, 'data/safeslackforce-live.sqlite');
    assert.equal(readFileSync('data/incidentos-live.sqlite', 'utf8'), 'existing incident and budget data');
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
});
