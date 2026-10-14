import { createOrm, migrateDatabase } from '../src/orm.js';

const orm = await createOrm();
try {
  const applied = await migrateDatabase(orm);
  console.log(applied.length ? 'Applied ' + applied.map(migration => migration.name).join(', ') : 'Database already initialized');
} finally {
  await orm.close();
}
