import { officeRecordSchema, type OfficeRecord } from '../apps/api/src/office.js';

// Fictional organization, people, services and benefits. Never a real contact roster.
const make = (id: string, category: OfficeRecord['category'], title: string, owner: string, details: OfficeRecord['details'], references: string[] = []): OfficeRecord => officeRecordSchema.parse({
  id: `office:${id}`, category, title, ownerDepartmentId: `office:${owner}`, details,
  references: references.map(r => `office:${r}`), version: 1, synthetic: true, visibility: 'coordination',
});
const departments = ['management', 'operations', 'facilities', 'safety', 'people', 'it', 'finance', 'healthcare'];
const people = [
  ['maya-sen', 'Maya Sen', 'management', 'Site director', ''],
  ['arun-shah', 'Arun Shah', 'operations', 'Day shift lead', 'maya-sen'],
  ['lena-ortiz', 'Lena Ortiz', 'operations', 'Evening shift lead', 'maya-sen'],
  ['noah-park', 'Noah Park', 'facilities', 'Facilities coordinator', 'maya-sen'],
  ['priya-das', 'Priya Das', 'safety', 'Safety coordinator', 'maya-sen'],
  ['elena-reed', 'Elena Reed', 'people', 'People operations partner', 'maya-sen'],
  ['sam-chen', 'Sam Chen', 'it', 'IT service lead', 'maya-sen'],
  ['ava-brooks', 'Ava Brooks', 'finance', 'Benefits finance liaison', 'maya-sen'],
  ['jordan-lee', 'Jordan Lee', 'healthcare', 'Occupational health coordinator', 'maya-sen'],
  ['alex-rivera', 'Alex Rivera', 'operations', 'Warehouse associate', 'arun-shah'],
  ['iman-cole', 'Iman Cole', 'operations', 'Inventory associate', 'arun-shah'],
  ['ravi-mehta', 'Ravi Mehta', 'operations', 'Warehouse associate', 'lena-ortiz'],
];

export const officeRecords: OfficeRecord[] = [
  ...departments.map(d => make(d, 'departments', `Demo ${d} department`, d, { organization: 'Harborworks Demo Office', site: 'Demo Site B', scope: `Synthetic ${d} coordination` })),
  ...people.map(([id, name, dept, title, manager]) => make(id, 'employees', `${name} (fictional)`, dept, { jobTitle: title, managerId: manager ? `office:${manager}` : 'none', email: `${id}@harborworks.example`, shift: dept === 'operations' ? (['lena-ortiz', 'ravi-mehta'].includes(id) ? '14:00–22:00' : '06:00–14:00') : '09:00–17:00', timezone: 'America/New_York', siteId: 'office:site-b' }, [dept, 'site-b', ...(manager ? [manager] : [])])),
  ...departments.map(d => {
    const head = people.find(p => p[2] === d)!;
    return make(`contact-${d}`, 'contacts', `Demo ${d} desk`, d, { email: `${d}@harborworks.example`, channel: `DEMO ONLY: #${d}-desk`, telephone: 'NOT CONFIGURED — no callable number', primaryEmployeeId: `office:${head[0]}`, escalation: 'Request the configured incident supervisor; this directory does not authorize new Slack recipients.' }, [d, head[0]]);
  }),
  make('site-b', 'facilities', 'Demo Site B office and warehouse', 'facilities', { address: 'Fictional site; no real street address', timezone: 'America/New_York', zones: ['Office floor', 'Loading Dock B', 'Warehouse aisle 3', 'Wellness room'], siteMap: 'Not provided; do not infer exits or physical locations.' }),
  make('dock-b', 'facilities', 'Loading Dock B', 'operations', { siteId: 'office:site-b', equipment: ['Demo forklift FL-01', 'Demo dock gate DG-02'], access: 'Physical access controlled by designated site staff; agents cannot authorize entry.' }, ['site-b', 'arun-shah']),
  make('wellness-room', 'facilities', 'Wellness room', 'healthcare', { siteId: 'office:site-b', availability: 'Must be checked with site staff', limitation: 'Not an emergency department or a verified care location.' }, ['site-b', 'jordan-lee']),
  make('health-plan', 'insurance_plans', 'Demo employee health plan', 'people', { insurer: 'Example Health (fictional)', groupReference: 'DEMO-GROUP-001', planYear: '2026 fixture', supportContactId: 'office:contact-people', coverage: 'Illustrative benefit catalog only. Eligibility, network, deductible, limits and prior authorization are unverified.', claimsProcess: 'Benefits team confirms the actual plan and secure submission route; do not put member IDs or clinical records in Slack.' }, ['contact-people']),
  make('workplace-plan', 'insurance_plans', 'Demo workplace incident coverage', 'people', { insurer: 'Example Workplace Cover (fictional)', groupReference: 'DEMO-WORK-001', coverage: 'No determination of legal eligibility or coverage is made by this fixture.', process: 'Route the incident reference to People Operations for review. A report does not establish an accepted claim.' }, ['contact-people', 'policy-privacy']),
  make('dental-plan', 'insurance_plans', 'Demo dental benefit', 'people', { insurer: 'Example Dental (fictional)', coverage: 'Plan illustration; no verified coverage or reimbursement amounts.', supportContactId: 'office:contact-people' }, ['contact-people']),
  make('occupational-health', 'healthcare_services', 'Occupational health coordination', 'healthcare', { provider: 'Example Occupational Clinic (fictional)', contact: 'occupational-health@harborworks.example', availability: 'Unverified; human scheduling required', services: ['Appointment coordination', 'Secure document routing', 'Return-to-work review routing'], boundary: 'Only qualified professionals assess health, prescribe, diagnose or clear return to work.' }, ['jordan-lee', 'policy-medical']),
  make('employee-assistance', 'healthcare_services', 'Employee assistance service', 'people', { provider: 'Example Support (fictional)', contact: 'eap@harborworks.example', services: ['Private support referral', 'Appointment coordination'], boundary: 'No counselling notes or personal disclosures in the incident channel.' }, ['contact-people', 'policy-privacy']),
  make('management-chain', 'management', 'Demo responsibility and escalation matrix', 'management', { accountable: 'office:maya-sen', operations: 'office:arun-shah', facilities: 'office:noah-park', safety: 'office:priya-das', people: 'office:elena-reed', afterHours: 'Availability unverified: request configured incident backup.', authority: 'Informational only. Actual Slack actor permissions come from server configuration, not titles or model inference.' }, ['maya-sen', 'arun-shah', 'noah-park', 'priya-das', 'elena-reed']),
  make('protocol-handoff', 'protocols', 'Shift handoff coordination', 'operations', { status: 'Approved for synthetic demo only', steps: ['Record incident reference and current source messages.', 'List unresolved work with named owners.', 'Request designated supervisor acceptance.', 'Keep transferred work visible; handoff is not closure.'], executable: 'Reference only; does not replace the configured forklift procedure.' }, ['management-chain']),
  make('protocol-call', 'protocols', 'Contact and callback tracking', 'operations', { status: 'Approved for synthetic demo only', steps: ['Select only authorized recipients.', 'Record whether a contact is requested, attempted, connected or failed.', 'Require an attributed human note for telephone outcomes.', 'Escalate unanswered contact using the configured backup rule.'], boundary: 'No telephone dialer is implemented. A queued message is not a phone call.' }, ['contact-operations']),
  make('protocol-facilities', 'protocols', 'Facilities issue routing', 'facilities', { status: 'Approved for synthetic demo only', steps: ['Record reported equipment ID and location.', 'Route to designated facilities staff.', 'Track acknowledgement and requested follow-up.'], boundary: 'No repair, evacuation or safety instruction is generated.' }, ['contact-facilities', 'dock-b']),
  make('protocol-benefits', 'protocols', 'Benefits inquiry routing', 'people', { status: 'Approved for synthetic demo only', steps: ['Collect only inquiry category and an incident reference if necessary.', 'Send a secure-contact request to the designated benefits team.', 'Confirm the actual policy with that team.'], boundary: 'Never request medical history or member identifiers in Slack.' }, ['health-plan', 'policy-privacy']),
  make('protocol-medical', 'protocols', 'Restricted health-record request routing', 'healthcare', { status: 'Approved for synthetic demo only', steps: ['Do not retrieve clinical details through agents.', 'Direct the requester to an authorized healthcare records custodian.', 'Use an approved secure system outside the Slack demo.'], boundary: 'The synthetic database is not an EHR or emergency-care system.' }, ['policy-medical', 'occupational-health']),
  ...[
    ['privacy', 'Data minimization and privacy', 'people', ['Keep diagnoses, medications, member IDs and clinical attachments out of public channels.', 'Share only the minimum operational facts with authorized participants.', 'Real retention and deletion schedules must be approved before production.']],
    ['medical', 'Medical record access', 'healthcare', ['Agents and dashboard pairing tokens cannot read restricted medical records.', 'Actual access requires verified identity, purpose and approved clinical permissions.', 'Synthetic local records are not a compliant medical-record service.']],
    ['incident', 'Incident documentation', 'safety', ['Preserve corrections and attributed confirmations.', 'Distinguish reported facts from verified digital delivery.', 'Only the designated supervisor can close an incident.']],
    ['access', 'Office access and visitor handling', 'facilities', ['Route access requests to designated site staff.', 'Do not infer permission from a job title or contact listing.']],
    ['it', 'IT account and credential handling', 'it', ['Never include API keys, passwords or access tokens in office records.', 'Route account changes through authorized IT staff.']],
    ['benefits', 'Benefits verification', 'people', ['A benefit catalog entry is not proof of individual eligibility.', 'Coverage and claims must be confirmed with the actual plan administrator.']],
  ].map(([id, title, owner, rules]) => make(`policy-${id}`, 'policies', title as string, owner as string, { status: 'Demo policy only — not real organizational or legal approval', effectiveDate: '2026-09-12', reviewDate: '2026-10-12', rules: rules as string[] })),
  ...[
    ['001', 'contact-operations', 'requested', 'Demo request to accept incident coordination; no telephone call placed.'],
    ['002', 'contact-facilities', 'reported_connected', 'Synthetic human reports reaching facilities desk; independent verification unavailable.'],
    ['003', 'contact-people', 'reported_no_answer', 'Synthetic benefits callback attempt; no response reported.'],
    ['004', 'contact-healthcare', 'callback_requested', 'Synthetic request for private appointment coordination; no clinical details stored here.'],
  ].map(([id, contact, state, outcome]) => make(`call-${id}`, 'call_logs', `Synthetic call log ${id}`, 'operations', { occurredAt: `2026-09-12T14:${id === '001' ? '00' : id === '002' ? '05' : id === '003' ? '10' : '15'}:00Z`, contactId: `office:${contact}`, status: state, outcome, provenance: 'Seeded simulation, not an actual call or provider receipt', incidentReference: 'DEMO-HISTORY-001', recordedBy: 'office:arun-shah' }, [contact, 'arun-shah'])),
];

// Stored in a DIFFERENT file; not imported/opened by the API or agents.
export const restrictedOfficeRecords = ['alex-rivera', 'iman-cole', 'ravi-mehta'].flatMap((employee, n) => [
  { id: `restricted:medical-${n + 1}`, category: 'medical_records', synthetic: true, employeeId: `office:${employee}`, custodianDepartmentId: 'office:healthcare', visitId: `DEMO-VISIT-${n + 1}`, visitDate: '2026-09-01', encounterType: 'Fictional occupational-health appointment', clinicalHistory: 'SYNTHETIC PLACEHOLDER — no real patient history', allergies: ['Unknown in fixture; not evidence of no allergies'], medications: ['Not collected in fixture'], diagnosticReports: [], followUp: 'Example private appointment coordination; no clinical advice', accessClass: 'restricted-clinical' },
  { id: `restricted:enrollment-${n + 1}`, category: 'insurance_enrollments', synthetic: true, employeeId: `office:${employee}`, planId: 'office:health-plan', memberId: `DEMO-NOT-VALID-${n + 1}`, eligibility: 'Synthetic example only; not verified', accessClass: 'restricted-benefits' },
]);
