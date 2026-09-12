import { officeRecords, restrictedOfficeRecords } from '../../../fixtures/office-data.js';
import { officeMeta, officeRecordSchema } from './office.js';
import { Store } from './store.js';

export function seedOffice(publicStore: Store, restrictedStore: Store) {
  const records = officeRecords.map(r => officeRecordSchema.parse(r));
  const ids = new Set(records.map(r => r.id));
  if (ids.size !== records.length) throw new Error('Duplicate office record ID');
  for (const r of records) {
    if (!records.some(d => d.id === r.ownerDepartmentId && d.category === 'departments')) throw new Error(`Invalid department: ${r.id}`);
    for (const ref of r.references) if (!ids.has(ref)) throw new Error(`Missing reference: ${ref}`);
  }
  for (const r of restrictedOfficeRecords) if (!ids.has(r.employeeId)) throw new Error('Invalid restricted employee link');
  // Refuse to silently overwrite an existing seed, or an incident database.
  for (const s of [publicStore, restrictedStore]) {
    if (s.list('incident').length || s.get('office:metadata') || s.list('office-record').length || s.list('restricted-office-record').length) throw new Error('Seed target is not an empty office database; existing data was not overwritten.');
  }
  publicStore.transaction(() => {
    publicStore.put('office:metadata', 'office-metadata', officeMeta);
    for (const r of records) publicStore.put(r.id, 'office-record', r);
  });
  restrictedStore.transaction(() => {
    restrictedStore.put('office:metadata', 'office-metadata', { ...officeMeta, restricted: true });
    for (const r of restrictedOfficeRecords) restrictedStore.put(r.id, 'restricted-office-record', r);
  });
  return { coordinationRecords: records.length, restrictedRecords: restrictedOfficeRecords.length };
}
