import { z } from 'zod';
import type { SourceRef } from '@safeslackforce/contracts';
import { Store } from './store.js';

export const officeCategory = z.enum(['departments', 'employees', 'contacts', 'facilities', 'insurance_plans', 'healthcare_services', 'management', 'protocols', 'policies', 'call_logs']);
export const officeRecordSchema = z.object({
  id: z.string().regex(/^office:[a-z0-9-]+$/), category: officeCategory,
  title: z.string(), version: z.literal(1), synthetic: z.literal(true), visibility: z.literal('coordination'),
  ownerDepartmentId: z.string(), references: z.array(z.string()),
  details: z.record(z.union([z.string(), z.array(z.string())])),
}).strict();
export type OfficeRecord = z.infer<typeof officeRecordSchema>;
export const OFFICE_DATASET = 'synthetic-office-v1';
export const officeMeta = { dataset: OFFICE_DATASET, synthetic: true, clinicalUse: false };

// Runtime opens only the coordination store. It never opens the medical/enrollment store.
export class OfficeDirectory {
  constructor(private store: Store) {
    const meta = store.get<typeof officeMeta & { restricted?: boolean }>('office:metadata');
    if (meta?.dataset !== OFFICE_DATASET || meta.synthetic !== true || meta.clinicalUse !== false || meta.restricted) throw new Error('Office demo database missing or incompatible. Run npm run seed:office first.');
  }
  search(input: unknown) {
    const { category, query, limit } = z.object({ category: officeCategory.optional(), query: z.string().max(120).default(''), limit: z.number().int().min(1).max(20).default(10) }).strict().parse(input);
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = this.store.list<unknown>('office-record').map(r => officeRecordSchema.parse(r)).filter(r => (!category || r.category === category) && terms.every(term => JSON.stringify(r).toLowerCase().includes(term)));
    return { ...officeMeta, total: rows.length, records: rows.slice(0, limit).map(r => ({ ...r, source: this.source(r.id)! })) };
  }
  source(id: string): SourceRef | undefined {
    const candidate = this.store.get<unknown>(id);
    const parsed = officeRecordSchema.safeParse(candidate);
    return parsed.success ? { id, kind: 'procedure', label: `SYNTHETIC reference: ${parsed.data.title} v${parsed.data.version}` } : undefined;
  }
  summary() {
    const rows = this.store.list<unknown>('office-record').map(r => officeRecordSchema.parse(r));
    return { ...officeMeta, counts: Object.fromEntries(officeCategory.options.map(c => [c, rows.filter(r => r.category === c).length])), restrictedRecordsAccessible: false };
  }
}
