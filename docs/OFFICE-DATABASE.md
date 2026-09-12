# Synthetic office database

This is a fictional office-and-warehouse dataset for demonstrating SafeSlackForce. It is not an organization's actual policy library, employee registry, insurance entitlement system or electronic health record. Do not import real medical or insurance-member data.

## Included

| Category | Seeded records | Contents |
| --- | ---: | --- |
| Departments | 8 | Management, operations, facilities, safety, people, IT, finance, healthcare |
| Employees | 12 | Fictional names, titles, shifts, manager links, example-domain email |
| Contacts | 8 | Department desks and primary owners; no callable telephone numbers |
| Facilities | 3 | Site B, Dock B and wellness room; no assumed exit map |
| Insurance plans | 3 | Illustrative health, workplace and dental catalogs; no verified coverage |
| Healthcare services | 2 | Occupational-health and assistance coordination |
| Management | 1 | Responsibility matrix, human escalation and authority boundary |
| Protocols | 5 | Handoff, callbacks, facilities, benefits and restricted-record routing |
| Policies | 6 | Privacy, medical access, incident documentation, office access, IT and benefits |
| Call logs | 4 | Clearly simulated contact requests and human-reported outcomes |
| Restricted medical records | 3 | Minimal synthetic encounter structures, unknown allergy/medication placeholders, no clinical advice |
| Restricted insurance enrollment | 3 | Fictional employee/plan links and invalid demo member references |

There are **52 coordination records and 6 restricted records**. These are meaningful linked demo examples, not a claim that every real office workflow is implemented.

## Storage and isolation

- `data/office-demo.sqlite`: coordination records and dataset metadata. The optional runtime directory opens only this file.
- `data/office-restricted-demo.sqlite`: synthetic medical records and individual enrollment. No HTTP route, dashboard pairing token or agent tool exposes this store. It is for local schema inspection only.
- Existing incident databases remain authoritative for actual Slack messages, delivery receipts, agent activity, model-budget records and handoffs. Historical synthetic call logs are NOT inserted into real incident timelines.

Both files use the existing SQLite `entities` table, with typed coordination records, version numbers, department ownership and explicit record references. The seed validates duplicate IDs, reference existence and department types. Relationships are validated in the application, not SQL foreign keys. The seed refuses existing files; it is not a migration or production editing API.

Files are git-ignored and written with mode `0600`. Restricted isolation is not encryption or production role-based clinical access. Real records would need a separately designed authenticated service, access auditing, retention/deletion controls, encryption, organizational approval and applicable compliance review. Do not treat the current shared demo pairing token as employee identity.

## Use

From the feature checkout, with Node 22:

```sh
npm run seed:office
```

Already seeded locally in the feature worktree; do not rerun over existing files. Ritesh can generate his own copy from the committed fixtures.

To enable on a deliberately chosen runtime, set `OFFICE_DEMO_ENABLED=true` in its ignored `.env`, then restart it. Main/live configuration has NOT been changed. For a safe separate rehearsal, use fixture mode, a separate incident database and different ports; do not start a second live Slack Socket Mode consumer.

Open the **book icon in the left rail** to search the office reference database after pairing. The category selector and text search show up to 20 matches; narrow the query if needed. Restricted data never appears there. Browser visual QA remains to be completed.

Authenticated endpoints:

- `GET /api/office`: category counts and synthetic/restricted-access flags.
- `GET /api/office/records?category=policies&query=privacy&limit=10`: bounded, schema-validated coordination search.

`read_office` is available to Commander, Procedure, Communications and Records only when the directory is enabled. It executes a local database search and returns source IDs. It does not need Exa, vector embeddings or another provider. A live agent still uses its normal bounded OpenRouter reasoning calls when choosing and interpreting tools.

Example Slack questions once this branch is enabled:

- “Which synthetic office privacy policy applies to what we put in this channel? Cite the reference.”
- “Look up the demo occupational-health coordination service. Do not retrieve medical records.”
- “Who is the fictional facilities contact, and what is the escalation policy? Do not notify anyone.”
- “Show the simulated callback history, clearly separating it from this incident's actual Slack receipts.”

Directory contacts NEVER extend the configured Slack allowlist. Reference protocols do not become executable emergency procedures. No phone integration, patient lookup, insurance verification, diagnosis or real-world dispatch has been added.

## Tests

`npm run test:all` and `npm run build` cover seed validation, persistence/private file mode, access isolation, bounded search, authenticated HTTP, source linkage, unchanged notification authorization and actual tool dispatch using a scripted model. No live provider calls are required.
