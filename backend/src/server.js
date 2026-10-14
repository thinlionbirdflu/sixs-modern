import pg from 'pg';
import { createApp } from './app.js';
const host = process.env.HOST || '127.0.0.1';
const token = process.env.API_TOKEN || '';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in backend/.env');
if ((!['127.0.0.1', 'localhost', '::1'].includes(host) || process.env.NODE_ENV === 'production') && !token)
  throw new Error('API_TOKEN is required outside local development');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
pool.on('error', err => console.error('Database pool error:', err.code));
pg.types.setTypeParser(1082, value => value); // Preserve calendar dates, without timezone conversion.
const server = createApp(pool, token).listen(Number(process.env.PORT || 3001), host, () => console.log('SIXS API listening on ' + host + ':' + (process.env.PORT || 3001)));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => { await pool.end(); clearTimeout(deadline); process.exit(0); });
});
