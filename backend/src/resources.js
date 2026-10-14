import { z } from 'zod';
const text = (max = 100) => z.string().trim().min(1).max(max);
const optionalText = (max = 100) => text(max).nullable().optional();
const id = z.number().int().positive().max(2147483647);
const date = z.iso.date();
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use a nonnegative decimal with up to 2 decimal places');
const percentage = z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).refine(v => Number(v) <= 100);
const decimal = z.string().regex(/^\d{1,10}(\.\d{1,4})?$/);
export const resources = {
  customers: { table: 'customers', search: ['first_name', 'last_name', 'city'], schema: z.object({
    first_name: text(), last_name: text(), middle_initial: optionalText(1),
    ssn_last_four: z.string().regex(/^\d{4}$/).nullable().optional(),
    date_of_birth: date, street: text(250), city: text(),
    state: z.string().regex(/^[A-Z]{2}$/), zip_code: z.string().regex(/^\d{5}(-\d{4})?$/),
    county: optionalText(), phone_number: text(30),
    spouse_first_name: optionalText(), spouse_last_name: optionalText(), notes: optionalText(10000)
  }).strict() },
  companies: { table: 'companies', search: ['name'], schema: z.object({
    name: text(150), contact_number: optionalText(30)
  }).strict() },
  employees: { table: 'employees', search: ['first_name', 'last_name', 'username'], schema: z.object({
    first_name: text(), last_name: text(), username: text(150),
    identity_subject: optionalText(250), active: z.boolean().optional()
  }).strict() },
  'policy-types': { table: 'policy_types', search: ['name'], schema: z.object({
    name: text(150), description: optionalText(10000)
  }).strict() },
  'alternate-contacts': { table: 'alternate_contacts', search: ['first_name', 'last_name'], schema: z.object({
    customer_id: id, first_name: text(), last_name: text(), relationship: text(), phone_number: text(30)
  }).strict() },
  medicare: { table: 'medicare_enrollments', search: [], schema: z.object({
    customer_id: id, card_number: text(30),
    part_a_enrolled_on: date.nullable().optional(), part_b_enrolled_on: date.nullable().optional()
  }).strict() },
  policies: { table: 'policies', search: ['policy_number', 'policy_holder'], schema: z.object({
    customer_id: id, company_id: id, policy_type_id: id, employee_id: id,
    policy_number: text(), policy_holder: text(200), age_at_issue: z.number().int().min(0).max(130),
    date_written: date, date_effective: date, status: text(50), billing_period: text(50),
    premium: money, commission_percentage: percentage, initial_percentage: percentage,
    renewal: decimal, written_by_username: optionalText(150)
  }).strict() }
};
export const updateVersion = z.number().int().positive();
export function parseId(value) {
  if (!/^[1-9]\d*$/.test(String(value))) throw Object.assign(new Error('Invalid ID'), { status: 400 });
  return id.parse(Number(value));
}
