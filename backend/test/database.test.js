import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestOrm } from './helpers.js';

import { createApp } from '../src/app.js';

test('PostgreSQL schema and HTTP workflows preserve relationships, reports and concurrency', { timeout: 60000 }, async () => {
  const orm = await createTestOrm();
  const server = createApp(orm).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/';
  async function request(path, method = 'GET', body) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }
  try {
    const customer = await request('customers', 'POST', {
      first_name:'Test', last_name:'Customer', date_of_birth:'1950-02-01',
      street:'123 Example Street', city:'Example', state:'IL', zip_code:'60601', phone_number:'555-0100'
    });
    assert.equal(customer.status, 201);
    assert.equal(customer.body.data.date_of_birth, '1950-02-01');
    const customerId = customer.body.data.id;
    const company = await request('companies', 'POST', { name:'Test Carrier' });
    const type = await request('policy-types', 'POST', { name:'Supplement' });
    const employee = await request('employees', 'POST', { first_name:'Test',last_name:'Agent',username:'test-agent' });
    for (const result of [company,type,employee]) assert.equal(result.status,201);
    const policyInput = {
      customer_id:customerId, company_id:company.body.data.id, policy_type_id:type.body.data.id,
      employee_id:employee.body.data.id, policy_number:'TEST-001',policy_holder:'Test Customer',
      age_at_issue:76,date_written:'2026-01-15',date_effective:'2026-02-01',
      status:'Active',billing_period:'Monthly',premium:'123.45',commission_percentage:'10',
      initial_percentage:'20',renewal:'5'
    };
    const policy = await request('policies','POST',policyInput);
    assert.equal(policy.status,201);
    assert.equal(policy.body.data.premium,'123.45');
    assert.equal(policy.body.data.customer_id, customerId);
    assert.equal(policy.body.data.date_written, '2026-01-15');
    assert.equal(policy.body.data.commission_percentage, '10.0000');
    assert.equal((await request('policies','POST',policyInput)).status,409);
    assert.equal((await request('policies','POST',{...policyInput,policy_number:'BAD',customer_id:9999})).status,409);
    const report = await request('reports/sales?year=2026&employee_id='+employee.body.data.id);
    assert.equal(report.status,200);
    assert.equal(report.body.data[0].policy_count,1);
    assert.equal(report.body.data[0].total_premium,'123.45');
    assert.equal(report.body.data[0].month,'2026-01');
    assert.equal(report.body.data[0].employee_id, employee.body.data.id);
    assert.equal(report.body.data[0].employee, 'Test Agent');
    assert.equal(report.body.data[0].policy_type_id, type.body.data.id);
    assert.equal(report.body.data[0].policy_type, 'Supplement');
    const second = await request('policies', 'POST', { ...policyInput, policy_number: 'TEST-002', premium: '0.10' });
    const previous = await request('policies', 'POST', { ...policyInput, policy_number: 'TEST-003', date_written: '2025-12-31' });
    assert.equal(second.status, 201);
    assert.equal(previous.status, 201);
    const totals = await request('reports/sales?year=2026');
    assert.equal(totals.body.data.length, 1);
    assert.equal(totals.body.data[0].policy_count, 2);
    assert.equal(totals.body.data[0].total_premium, '123.55');
    assert.deepEqual((await request('reports/sales?year=2026&employee_id=9999')).body.data, []);
    await request('policies/' + second.body.data.id, 'DELETE', { version: 1 });
    await request('policies/' + previous.body.data.id, 'DELETE', { version: 1 });
    const updated = await request('companies/'+company.body.data.id,'PATCH',{name:'Revised Carrier',version:1});
    assert.equal(updated.status,200);
    assert.equal(updated.body.data.version,2);
    assert.equal((await request('companies/'+company.body.data.id,'PATCH',{name:'Stale',version:1})).status,409);
    assert.equal((await request('customers/'+customerId,'DELETE',{version:1})).status,409);
    const contact = await request('alternate-contacts','POST',{customer_id:customerId,first_name:'Test',last_name:'Contact',relationship:'Child',phone_number:'555-0101'});
    assert.equal(contact.status,201);
    const medicare = await request('medicare','POST',{customer_id:customerId,card_number:'DEMO-ONLY',part_a_enrolled_on:'2020-01-01'});
    assert.equal(medicare.status,201);
    assert.equal((await request('medicare','POST',{customer_id:customerId,card_number:'DUPLICATE'})).status,409);
    assert.equal((await request('policies?customer_id='+customerId)).body.data.length,1);
    assert.equal((await request('policies/'+policy.body.data.id,'DELETE',{version:1})).status,204);
    assert.equal((await request('reports/sales?year=2026')).body.data.length,0);
    await request('alternate-contacts/'+contact.body.data.id,'DELETE',{version:1});
    await request('medicare/'+medicare.body.data.id,'DELETE',{version:1});
    assert.equal((await request('customers/'+customerId,'DELETE',{version:1})).status,204);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    await orm.close();
  }
});
