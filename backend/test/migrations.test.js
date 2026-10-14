import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { MikroORM } from '@mikro-orm/pglite';
import { ormOptions, migrateDatabase } from '../src/orm.js';
import { Company, LegacyMigration } from '../src/entities.js';
import { createTestOrm } from './helpers.js';

test('MikroORM migrations initialize a fresh database and repeated runs preserve data', async () => {
  const orm = await createTestOrm();
  try {
    const em = orm.em.fork();
    const record = em.create(Company, { name: 'Existing carrier' });
    await em.flush();
    assert.deepEqual(await migrateDatabase(orm), []);
    assert.equal(await orm.em.fork().count(Company), 1);
    assert.deepEqual((await orm.migrator.getExecuted()).map(migration => migration.name), ['Migration001Initial']);
  } finally {
    await orm.close();
  }
});

test('adopts the original migration ledger without recreating tables or changing records', async () => {
  const db = new PGlite();
  let orm;
  try {
    await db.exec(await readFile(new URL('../../database/001_initial.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('./fixtures/legacy-ledger.sql', import.meta.url), 'utf8'));
    orm = await MikroORM.init({ ...ormOptions, driverOptions: { pglite: db } });
    const em = orm.em.fork();
    const company = em.create(Company, { name: 'Legacy carrier' });
    em.create(LegacyMigration, { name: '001_initial', applied_at: new Date() });
    await em.flush();
    assert.deepEqual(await migrateDatabase(orm), []);
    assert.deepEqual(await migrateDatabase(orm), []);
    assert.equal((await orm.em.fork().findOneOrFail(Company, company.id)).name, 'Legacy carrier');
    assert.deepEqual((await orm.migrator.getExecuted()).map(migration => migration.name), ['Migration001Initial']);
  } finally {
    await orm?.close();
    await db.close();
  }
});
