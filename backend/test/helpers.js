import { MikroORM } from '@mikro-orm/pglite';
import { ormOptions, migrateDatabase } from '../src/orm.js';
import { createApp } from '../src/app.js';

export async function createTestOrm() {
  const orm = await MikroORM.init(ormOptions);
  try {
    await migrateDatabase(orm);
    return orm;
  } catch (error) {
    await orm.close();
    throw error;
  }
}

export async function withServer(run, token = '') {
  const orm = await createTestOrm();
  const server = createApp(orm, token).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run('http://127.0.0.1:' + server.address().port, orm); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await orm.close();
  }
}
