import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
async function withServer(pool, run, token = '') {
  const server = createApp(pool, token).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('create binds values and rejects unknown fields before querying', async () => {
  const calls = [];
  const pool = { query: async (sql, values) => { calls.push({sql, values}); return { rows: [{id:1, version:1, name:values[0]}] }; } };
  await withServer(pool, async base => {
    const name = "Carrier'); DROP TABLE customers; --";
    const response = await fetch(base + '/api/companies', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
    assert.equal(response.status, 201);
    assert.equal(calls[0].sql.includes(name), false);
    assert.deepEqual(calls[0].values, [name]);
    const invalid = await fetch(base + '/api/companies', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, table:'customers'}) });
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 1);
  });
});
test('stale updates return conflict and bind row version', async () => {
  let params;
  await withServer({query:async (_sql,values)=> { params=values;return {rows:[]}; }}, async base => {
    const res = await fetch(base + '/api/companies/7', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Revised',version:2})});
    assert.equal(res.status,409);
    assert.deepEqual(params,['Revised',7,2]);
  });
});
test('pagination and report year reject invalid input without database calls', async () => {
  await withServer({query:async()=> { throw new Error('Unexpected database call'); }}, async base => {
    assert.equal((await fetch(base+'/api/customers?limit=1000')).status,400);
    assert.equal((await fetch(base+'/api/reports/sales?year=abc')).status,400);
    assert.equal((await fetch(base+'/api/unknown')).status,404);
  });
});
test('search treats SQL and wildcard characters as data', async () => {
  let call;
  await withServer({query:async(sql,values)=> { call={sql,values};return {rows:[]}; }}, async base => {
    const q="O'Brien%_";
    assert.equal((await fetch(base+'/api/customers?q='+encodeURIComponent(q))).status,200);
    assert.equal(call.sql.includes(q),false);
    assert.equal(call.values[0], "%O'Brien\\%\\_%");
  });
});
test('token protection rejects anonymous access; health remains available', async () => {
  await withServer({query:async()=>({rows:[]})}, async base => {
    assert.equal((await fetch(base+'/health')).status,200);
    assert.equal((await fetch(base+'/api/companies')).status,401);
    assert.equal((await fetch(base+'/api/companies',{headers:{Authorization:'Bearer test-secret'}})).status,200);
  },'test-secret');
});
test('database dependency errors return safe conflict response', async () => {
  await withServer({query:async()=> { throw Object.assign(new Error('secret detail'),{code:'23503'}); }}, async base => {
    const response=await fetch(base+'/api/customers/1',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{"version":1}'});
    assert.equal(response.status,409);
    assert.equal((await response.text()).includes('secret detail'),false);
  });
});
