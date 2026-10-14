import { DateType, DecimalType, EntitySchema } from '@mikro-orm/core';

const string = (length = 100, nullable = false) => ({ type: 'string', length, nullable });
const date = (nullable = false) => ({ type: DateType, nullable });
const decimal = (precision, scale) => ({ type: new DecimalType('string'), precision, scale });
const relation = (entity, unique = false) => ({ kind: 'm:1', entity, mapToPk: true, deleteRule: 'restrict', unique });
function entity(name, tableName, properties, options = {}) {
  for (const [field, property] of Object.entries(properties)) property.fieldName = field;
  return new EntitySchema({
    name, tableName, ...options,
    properties: {
      id: { type: 'integer', primary: true, autoincrement: true },
      ...properties,
      created_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
      updated_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() },
      version: { type: 'integer', default: 1 },
    },
  });
}

export const Customer = entity('Customer', 'customers', {
  first_name: string(), last_name: string(), middle_initial: string(1, true),
  ssn_last_four: string(4, true), date_of_birth: date(), street: string(250),
  city: string(), state: string(2), zip_code: string(10), county: string(100, true),
  phone_number: string(30), spouse_first_name: string(100, true), spouse_last_name: string(100, true),
  notes: { type: 'text', nullable: true },
});
export const Company = entity('Company', 'companies', {
  name: { ...string(150), unique: true }, contact_number: string(30, true),
});
export const Employee = entity('Employee', 'employees', {
  first_name: string(), last_name: string(), username: { ...string(150), unique: true },
  identity_subject: { ...string(250, true), unique: true }, active: { type: 'boolean', default: true },
});
export const PolicyType = entity('PolicyType', 'policy_types', {
  name: { ...string(150), unique: true }, description: { type: 'text', nullable: true },
});
export const AlternateContact = entity('AlternateContact', 'alternate_contacts', {
  customer_id: relation(() => Customer), first_name: string(), last_name: string(),
  relationship: string(), phone_number: string(30),
});
export const MedicareEnrollment = entity('MedicareEnrollment', 'medicare_enrollments', {
  customer_id: relation(() => Customer, true), card_number: string(30),
  part_a_enrolled_on: date(true), part_b_enrolled_on: date(true),
});
export const Policy = entity('Policy', 'policies', {
  customer_id: relation(() => Customer), company_id: relation(() => Company),
  policy_type_id: relation(() => PolicyType), employee_id: relation(() => Employee),
  policy_number: string(), policy_holder: string(200), age_at_issue: { type: 'smallint' },
  date_written: date(), date_effective: date(), status: string(50), billing_period: string(50),
  premium: decimal(14, 2), commission_percentage: decimal(7, 4), initial_percentage: decimal(7, 4),
  renewal: decimal(14, 4), written_by_username: string(150, true),
}, { uniques: [{ properties: ['company_id', 'policy_number'] }] });

// Read the old migration ledger when adopting an already initialized database.
export const LegacyMigration = new EntitySchema({
  name: 'LegacyMigration', tableName: 'schema_migrations',
  properties: { name: { type: 'text', primary: true }, applied_at: { type: 'Date', columnType: 'timestamptz' } },
});
export const entities = [Customer, Company, Employee, PolicyType, AlternateContact, MedicareEnrollment, Policy, LegacyMigration];
export const resourceEntities = {
  customers: Customer, companies: Company, employees: Employee, 'policy-types': PolicyType,
  'alternate-contacts': AlternateContact, medicare: MedicareEnrollment, policies: Policy,
};
