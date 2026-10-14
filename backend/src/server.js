import { createApp } from './app.js';
import { createOrm } from './orm.js';
const host = process.env.HOST || '127.0.0.1';
const token = process.env.API_TOKEN || '';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in backend/.env');
if ((!['127.0.0.1', 'localhost', '::1'].includes(host) || process.env.NODE_ENV === 'production') && !token)
  throw new Error('API_TOKEN is required outside local development');
const orm = await createOrm();
const server = createApp(orm, token).listen(Number(process.env.PORT || 3001), host, () => console.log('SIXS API listening on ' + host + ':' + (process.env.PORT || 3001)));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => { await orm.close(); clearTimeout(deadline); process.exit(0); });
});
