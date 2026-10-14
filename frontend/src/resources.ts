export type Row = { id: number; version: number; [key: string]: string | number | boolean | null };
export type Field = { name: string; label: string; type?: 'text' | 'date' | 'number' | 'decimal' | 'textarea' | 'checkbox'; required?: boolean; ref?: string };
export type Resource = { path: string; label: string; columns: string[]; fields: Field[] };
const f = (name: string, label: string, required = true, type: Field['type'] = 'text', ref?: string): Field => ({ name, label, required, type, ref });
export const resources: Resource[] = [
  { path: 'customers', label: 'Customers', columns: ['first_name', 'last_name', 'city', 'phone_number'], fields: [
    f('first_name','First name'), f('last_name','Last name'), f('middle_initial','Middle initial',false),
    f('ssn_last_four','SSN last four digits',false), f('date_of_birth','Date of birth',true,'date'),
    f('street','Street'), f('city','City'), f('state','State (two uppercase letters)'), f('zip_code','ZIP code'),
    f('county','County',false), f('phone_number','Phone number'),
    f('spouse_first_name','Spouse first name',false), f('spouse_last_name','Spouse last name',false), f('notes','Notes',false,'textarea')
  ] },
  { path: 'policies', label: 'Policies', columns: ['policy_number','policy_holder','status','premium'], fields: [
    f('customer_id','Customer',true,'number','customers'), f('company_id','Company',true,'number','companies'),
    f('policy_type_id','Policy type',true,'number','policy-types'), f('employee_id','Employee',true,'number','employees'),
    f('policy_number','Policy number'), f('policy_holder','Policy holder'), f('age_at_issue','Age at issue',true,'number'),
    f('date_written','Date written',true,'date'), f('date_effective','Effective date',true,'date'),
    f('status','Status'), f('billing_period','Billing period'), f('premium','Premium',true,'decimal'),
    f('commission_percentage','Commission percentage (0–100)',true,'decimal'),
    f('initial_percentage','Initial percentage (0–100)',true,'decimal'), f('renewal','Renewal value',true,'decimal'),
    f('written_by_username','Legacy writer username',false)
  ] },
  { path:'companies', label:'Companies', columns:['name','contact_number'], fields:[f('name','Name'),f('contact_number','Contact number',false)] },
  { path:'policy-types', label:'Policy types', columns:['name','description'], fields:[f('name','Name'),f('description','Description',false,'textarea')] },
  { path:'employees', label:'Employees', columns:['first_name','last_name','username','active'], fields:[
    f('first_name','First name'),f('last_name','Last name'),f('username','Username'),f('identity_subject','Identity provider subject',false),f('active','Active',false,'checkbox')
  ] },
  { path:'alternate-contacts', label:'Alternate contacts', columns:['customer_id','first_name','last_name','relationship','phone_number'], fields:[
    f('customer_id','Customer',true,'number','customers'),f('first_name','First name'),f('last_name','Last name'),f('relationship','Relationship'),f('phone_number','Phone number')
  ] },
  { path:'medicare', label:'Medicare', columns:['customer_id','part_a_enrolled_on','part_b_enrolled_on'], fields:[
    f('customer_id','Customer',true,'number','customers'),f('card_number','Medicare card number'),
    f('part_a_enrolled_on','Part A enrolled on',false,'date'),f('part_b_enrolled_on','Part B enrolled on',false,'date')
  ] }
];
export function rowLabel(row: Row) {
  return String(row.name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.policy_number || row.id);
}
