import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { Incidents } from '../src/domain.js';
import { Media, allowedSlackDownload, imageMime } from '../src/media.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=', 'base64');
async function setup() {
  const store = await Store.open(':memory:');
  const config = readConfig({ DASHBOARD_TOKEN: 'test-only-media-token-12345678', SLACK_FILES_ENABLED: 'true', VISION_ENABLED: 'true', SLACK_BOT_TOKEN: 'test-not-a-real-token' });
  const domain = new Incidents(store, config);
  const incident = domain.create({ team: 'TDEMO', channel: 'CDEMO', ts: '100.1', user: 'UREPORTER', text: 'Forklift incident at Dock B' });
  return { store, domain, id: incident.snapshot.incidentId };
}
test('Slack media accepts only allowlisted HTTPS URLs and supported raster signatures', () => {
  for (const url of ['http://files.slack.com/a', 'https://evil.test/a', 'https://files.slack.com.evil.test/a', 'https://user:pass@files.slack.com/a', 'https://files.slack.com:444/a']) assert.throws(() => allowedSlackDownload(url), /Unapproved/);
  assert.equal(allowedSlackDownload('https://files.slack.com/files-pri/a'), 'https://files.slack.com/files-pri/a');
  assert.equal(imageMime(png), 'image/png'); assert.throws(() => imageMime(Buffer.from('<svg onload="alert(1)">')), /raster/);
});
test('media ingestion, cached vision and deletion preserve evidence boundaries', async () => {
  const s = await setup(); const original = globalThis.fetch; let fetches = 0; let visions = 0;
  globalThis.fetch = async (url, init) => {
    fetches++; assert.equal(String(url), 'https://files.slack.com/files-pri/image');
    assert.equal(init?.redirect, 'error');
    return new Response(png, { headers: { 'content-type': 'image/png' } });
  };
  const media = new Media(s.domain, { info: async id => ({ id, name: 'synthetic.png', mimetype: 'image/png', size: png.length, url_private: 'https://files.slack.com/files-pri/image' }) },
    { describeImage: async () => { visions++; return 'A light pixel; cannot infer an incident or site safety.'; } });
  try {
    await media.ingest(s.id, '100.1', [{ id: 'F1' }]); await media.ingest(s.id, '100.1', [{ id: 'F1' }]);
    assert.equal(fetches, 1); assert.deepEqual(media.get(s.id, 'F1').bytes, png);
    await Promise.all([media.analyze(s.id, 'F1'), media.analyze(s.id, 'F1')]);
    assert.equal(visions, 1); assert.match(s.domain.get(s.id).attachments![0].observation!, /Unverified model/);
    assert.equal(s.domain.get(s.id).snapshot.tasks.length, 0);
    s.domain.addMessage(s.id, { ts: '100.1', user: 'UREPORTER', text: '', deleted: true, revision: '300.1' });
    assert.throws(() => media.get(s.id, 'F1'), /missing or removed/);
    assert.throws(() => s.domain.source(s.domain.get(s.id), ['file:F1']), /removed source/);
  } finally { globalThis.fetch = original; s.store.close(); }
});
test('media rejects misleading MIME and advertised oversized response before storing', async () => {
  const s = await setup(); const original = globalThis.fetch;
  const media = new Media(s.domain, { info: async id => ({ id, name: 'bad.png', mimetype: 'image/png', size: 50, url_private: 'https://files.slack.com/files-pri/image' }) });
  try {
    globalThis.fetch = async () => new Response('<html>not an image</html>');
    await assert.rejects(media.ingest(s.id, '100.1', [{ id: 'F1' }]), /raster/);
    globalThis.fetch = async () => new Response(png, { headers: { 'content-length': '9000000' } });
    await assert.rejects(media.ingest(s.id, '100.1', [{ id: 'F2' }]), /too large/);
    assert.equal(s.domain.get(s.id).attachments?.length ?? 0, 0);
  } finally { globalThis.fetch = original; s.store.close(); }
});
