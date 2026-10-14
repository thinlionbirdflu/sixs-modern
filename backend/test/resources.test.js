import test from 'node:test';
import assert from 'node:assert/strict';
import { resources, parseId } from '../src/resources.js';
test('rejects SQL-like IDs and unsafe integer IDs', () => {
  for (const value of ['1 OR 1=1', '0', '-1', '1.5', '2147483648']) assert.throws(() => parseId(value));
  assert.equal(parseId('42'), 42);
});
test('rejects unexpected fields rather than accepting SQL identifiers', () => {
  assert.equal(resources.companies.schema.safeParse({ name: 'Example', id: 7 }).success, false);
});
test('validates real calendar dates and SSN suffixes', () => {
  const schema = resources.customers.schema.partial();
  assert.equal(schema.safeParse({ date_of_birth: '2025-02-30' }).success, false);
  assert.equal(schema.safeParse({ ssn_last_four: '123-45-6789' }).success, false);
  assert.equal(schema.safeParse({ date_of_birth: '2000-02-29', ssn_last_four: '6789' }).success, true);
});
test('keeps money decimal and limits percentages', () => {
  const schema = resources.policies.schema.partial();
  assert.equal(schema.safeParse({ premium: '12.34', commission_percentage: '100' }).success, true);
  for (const data of [{ premium: '12.345' }, { premium: -1 }, { commission_percentage: '101' }])
    assert.equal(schema.safeParse(data).success, false);
});
