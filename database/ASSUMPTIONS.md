# Inferred database design

Source: Sample/Sample/ClassLib/Customer.cs and ClassLib/Repository/CustomerRepository.cs in the legacy project.
These are proposed tables, not a recovered database. No legacy rows are imported.

| Legacy model | Proposed table | Interpretation |
| --- | --- | --- |
| Customer | customers | Address, contact, spouse and demographic data |
| AlternateContact | alternate_contacts | Many contacts per customer |
| Medicare | medicare_enrollments | At most one current enrollment per customer |
| Company | companies | Insurance carriers |
| PolicyType | policy_types | Editable policy categories |
| Employee | employees | Business record linked optionally to external identity |
| Policy | policies | Customer policy attributed to employee, carrier and type |

Decisions requiring business confirmation:
- IDs are generated integers; legacy IDs need a mapping if data is later imported.
- Policy numbers are unique per carrier, not globally.
- Renewal's units are unclear in the old model: stored as a nonnegative decimal, without assuming dollars or percent.
- Commission and initial percentages use 0–100 units.
- Premium is a decimal amount; currency and billing conversion are not inferred.
- Status and billing period are free text until approved vocabularies exist.
- Date written and effective date have no ordering constraint; backdated policies may be legitimate.
- One Medicare record per customer is an assumption; enrollment history would require additional records.
- SSN storage is intentionally reduced to last four digits. Full SSNs cannot be recovered or round-tripped. Add an encrypted field and key-management design only if full SSNs are required.
- Medicare card numbers are sensitive and are plaintext in this local starter. Production requires a reviewed encryption and access-control design.
- Deletes are explicit, and related records prevent parent deletion. Production may need retention and soft deletion instead.
- Sales reports count all policies by date written, including policies later canceled; this follows the visible legacy reporting logic.
- Employee username attribution is editable legacy metadata, not authenticated identity.
- Money and decimal API fields are strings to avoid floating-point rounding.
- Row versions provide optimistic concurrency; timestamps and version increments are maintained by application SQL, without triggers or procedures.
- Tables initially share one database for referential integrity. They are modular service candidates, not independently deployed services yet.

No stored procedures, functions, triggers or password tables are created.
