import { z } from 'zod';
import { DomainError, Incidents, type Attachment } from './domain.js';

export interface FileInfoProvider { info(fileId: string): Promise<unknown> }
export interface VisionProvider { describeImage(dataUrl: string): Promise<string> }
const fileSchema = z.object({ id: z.string(), name: z.string().default('Slack image'), mimetype: z.enum(['image/png', 'image/jpeg', 'image/webp']), size: z.number().int().positive().max(3 * 1024 * 1024), url_private_download: z.string().optional(), url_private: z.string().optional() });
export function allowedSlackDownload(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== 'files.slack.com' || url.port || url.username || url.password) throw new DomainError(400, 'Unapproved Slack file URL');
  return url.toString();
}
export function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new DomainError(400, 'Not an allowed raster image');
}
export class Media {
  private analyzing = new Map<string, Promise<Attachment>>();
  constructor(private domain: Incidents, private provider?: FileInfoProvider, private vision?: VisionProvider) {}
  async ingest(id: string, messageId: string, files: { id: string }[]) {
    if (!this.domain.config.filesEnabled || !this.provider) {
      if (files.length) this.domain.agent(id, 'evidence', 'blocked', 'File ingestion is disabled; ask for a text description');
      return;
    }
    for (const candidate of files.slice(0, 4)) {
      const i = this.domain.get(id);
      if (i.attachments?.some(a => a.id === candidate.id)) continue;
      if ((i.attachments?.length ?? 0) >= 4) throw new DomainError(400, 'Demo attachment limit reached');
      const file = fileSchema.parse(await this.provider.info(candidate.id));
      if (file.id !== candidate.id) throw new DomainError(400, 'File ID mismatch');
      const url = allowedSlackDownload(file.url_private_download || file.url_private || '');
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.domain.config.botToken}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.body) throw new DomainError(502, 'Slack file download failed');
      const max = 3 * 1024 * 1024;
      if (Number(response.headers.get('content-length') || 0) > max) { await response.body.cancel(); throw new DomainError(413, 'File too large'); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      try {
        for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > max) throw new DomainError(413, 'File too large'); chunks.push(next.value); }
      } finally { await reader.cancel(); }
      const bytes = Buffer.concat(chunks);
      if (imageMime(bytes) !== file.mimetype) throw new DomainError(400, 'File type mismatch');
      const current = this.domain.get(id);
      if (!current.messages.some(m => m.id === messageId && !m.deleted)) throw new DomainError(409, 'Source removed during download');
      const attachment: Attachment = { id: file.id, messageId, name: file.name.slice(0, 200), mimetype: file.mimetype, size: bytes.length,
        source: { id: `file:${file.id}`, kind: 'tool_result', label: `Slack attachment: ${file.name.slice(0, 200)} (not proof of safety)`, url: `/api/incidents/${id}/attachments/${file.id}` } };
      this.domain.store.transaction(() => this.domain.store.put(`blob-${id}-${file.id}`, 'attachment-blob', { base64: bytes.toString('base64') }));
      this.domain.mutate(id, 'Slack image stored; contents not yet analyzed', value => { value.attachments ??= []; value.attachments.push(attachment); if (value.snapshot.status === 'handoff_ready') value.snapshot.status = 'coordinating'; return [attachment.source]; });
    }
  }
  get(id: string, fileId: string) {
    const i = this.domain.get(id); const file = i.attachments?.find(a => a.id === fileId && !a.removed);
    if (!file || !i.messages.some(m => m.id === file.messageId && !m.deleted)) throw new DomainError(404, 'Attachment missing or removed');
    const blob = this.domain.store.get<{ base64: string }>(`blob-${id}-${fileId}`);
    if (!blob) throw new DomainError(404, 'Attachment data missing');
    return { file, bytes: Buffer.from(blob.base64, 'base64') };
  }
  analyze(id: string, fileId: string): Promise<Attachment> {
    const key = `${id}:${fileId}`; const pending = this.analyzing.get(key); if (pending) return pending;
    const run = this.analyzeOnce(id, fileId); this.analyzing.set(key, run);
    void run.finally(() => this.analyzing.delete(key)).catch(() => {}); return run;
  }
  private async analyzeOnce(id: string, fileId: string) {
    const { file, bytes } = this.get(id, fileId);
    if (file.observation) return file;
    if (!this.vision || !this.domain.config.visionEnabled) throw new DomainError(409, 'Vision disabled; use witness text');
    const observation = await this.vision.describeImage(`data:${file.mimetype};base64,${bytes.toString('base64')}`);
    this.get(id, fileId); // Revalidate after the external call: removal must revoke analysis too.
    const current = this.domain.mutate(id, 'Evidence agent recorded an unverified visual observation', i => {
      const a = i.attachments!.find(a => a.id === fileId)!; a.observation = `Unverified model observation: ${observation}`;
      if (i.snapshot.status === 'handoff_ready') i.snapshot.status = 'coordinating'; return [a.source];
    });
    return current.attachments!.find(a => a.id === fileId)!;
  }
}
