import pg from 'pg';
import { readFile } from 'node:fs/promises';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(742031)");
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const name = '001_initial';
  const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
  if (!applied.rowCount) {
    const sql = await readFile(new URL('../../database/001_initial.sql', import.meta.url), 'utf8');
    // Execute schema and migration ledger in the same transaction.
    await client.query('BEGIN');
    await client.query(sql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''));
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log('Applied ' + name);
  } else console.log('Database already initialized');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  await client.end(); // Also releases advisory lock.
}
