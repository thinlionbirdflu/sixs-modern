import { MikroORM } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { entities, LegacyMigration } from './entities.js';
import { Migration001Initial } from '../migrations/Migration001Initial.js';
import { sql } from '@mikro-orm/core';

export const ormOptions = {
  entities,
  extensions: [Migrator],
  migrations: {
    migrationsList: [Migration001Initial], transactional: true, allOrNothing: true,
    disableForeignKeys: false, snapshot: false,
  },
};

export function createOrm(clientUrl = process.env.DATABASE_URL) {
  if (!clientUrl) throw new Error('Set DATABASE_URL in backend/.env');
  return MikroORM.init({
    ...ormOptions, clientUrl, pool: { max: 10 },
    driverOptions: { connectionTimeoutMillis: 5000, statement_timeout: 10000 },
  });
}

export async function migrateDatabase(orm) {
  const migrator = orm.migrator;
  const storage = migrator.getStorage();
  const withLock = work => orm.em.fork().transactional(async em => {
    // Use a catalog row so this lock also works before any application tables exist.
    const lock = em.createQueryBuilder(LegacyMigration)
      .select(sql`pg_advisory_xact_lock(742031)`).limit(1)
      .getNativeQuery().from('pg_catalog.pg_namespace');
    await em.execute(lock);
    const transaction = em.getTransactionContext();
    storage.setMasterMigration(transaction);
    try {
      await storage.ensureTable();
      return await work(em, transaction);
    } finally {
      storage.unsetMasterMigration();
    }
  });
  // Bootstrap the ledger under the same lock, then initialize outside a transaction:
  // PGlite has one connection and migrator initialization performs schema discovery.
  await withLock(async () => {});
  await migrator.getExecuted();
  return withLock(async (em, transaction) => {
    const platform = orm.driver.getPlatform();
    const hasLegacyLedger = await platform.getSchemaHelper().tableExists(
      em.getConnection(), 'schema_migrations', 'public', transaction);
    const legacy = hasLegacyLedger && await em.findOne(LegacyMigration, { name: '001_initial' });
    if (legacy && !(await storage.executed()).includes('Migration001Initial'))
      await storage.logMigration({ name: 'Migration001Initial' }, transaction);
    return await migrator.up({ transaction });
  });
}
