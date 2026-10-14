import test from 'node:test';
import assert from 'node:assert/strict';
import { withServer } from './helpers.js';

const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('create stores SQL-looking text as data and rejects unknown fields', async () => {
  await withServer(async base => {
    const name = "Carrier'); DROP TABLE customers; --";
    const response = await fetch(base + '/api/companies', json({ name }));
    assert.equal(response.status, 201);
    const record = (await response.json()).data;
    assert.equal(record.name, name);
    assert.equal(record.version, 1);
    assert.equal(record.contact_number, null);
    assert.ok(record.created_at);
    const invalid = await fetch(base + '/api/companies', json({ name, table: 'customers' }));
    assert.equal(invalid.status, 400);
    assert.equal((await (await fetch(base + '/api/companies')).json()).data.length, 1);
    assert.equal((await fetch(base + '/api/customers')).status, 200);
  });
});

test('version checks are atomic for racing edits, no-op edits and deletes', async () => {
  await withServer(async base => {
    const created = await fetch(base + '/api/companies', json({ name: 'Carrier' }));
    const record = (await created.json()).data;
    const url = base + '/api/companies/' + record.id;
    const edit = name => fetch(url, { ...json({ name, version: 1 }), method: 'PATCH' });
    const responses = await Promise.all([edit('First'), edit('Second')]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const current = (await (await fetch(url)).json()).data;
    assert.equal(current.version, 2);
    const noOp = await fetch(url, { ...json({ name: current.name, version: 2 }), method: 'PATCH' });
    assert.equal(noOp.status, 200);
    assert.equal((await noOp.json()).data.version, 3);
    assert.equal((await fetch(url, { ...json({ version: 2 }), method: 'DELETE' })).status, 409);
    assert.equal((await fetch(url, { ...json({ version: 3 }), method: 'DELETE' })).status, 204);
    assert.equal((await fetch(url)).status, 404);
  });
});

test('pagination, report year and unknown endpoints reject invalid input', async () => {
  await withServer(async base => {
    assert.equal((await fetch(base + '/api/customers?limit=1000')).status, 400);
    assert.equal((await fetch(base + '/api/reports/sales?year=abc')).status, 400);
    assert.equal((await fetch(base + '/api/unknown')).status, 404);
  });
});

test('search treats wildcard characters, quotes and backslashes as literal substrings', async () => {
  await withServer(async base => {
    for (const name of ["O'Brien%_", "O'BrienXY", 'Back\\slash', 'Backslash'])
      assert.equal((await fetch(base + '/api/companies', json({ name }))).status, 201);
    for (const q of ["o'brien%_", 'Back\\slash']) {
      const response = await fetch(base + '/api/companies?q=' + encodeURIComponent(q));
      assert.equal(response.status, 200);
      const records = (await response.json()).data;
      assert.equal(records.length, 1);
    }
    const page = await (await fetch(base + '/api/companies?limit=1&offset=1')).json();
    assert.equal(page.data.length, 1);
    assert.equal(page.data[0].name, 'Back\\slash');
    assert.equal(page.limit, 1);
    assert.equal(page.offset, 1);
  });
});

test('token protection rejects anonymous access; health remains available', async () => {
  await withServer(async base => {
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/api/companies')).status, 401);
    assert.equal((await fetch(base + '/api/companies', { headers: { Authorization: 'Bearer test-secret' } })).status, 200);
  }, 'test-secret');
});
