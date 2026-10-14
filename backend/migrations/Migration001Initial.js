import { readFile } from 'node:fs/promises';
import { Migration } from '@mikro-orm/migrations';

export class Migration001Initial extends Migration {
  async up() {
    // Keep the historical schema (including checks and indexes) unchanged.
    const schema = await readFile(new URL('../../database/001_initial.sql', import.meta.url), 'utf8');
    // This fixed file contains only table/index DDL, without procedural bodies.
    const ddl = schema.replace(/^BEGIN;\r?$/m, '').replace(/^COMMIT;\r?$/m, '');
    for (const statement of ddl.split(';').map(value => value.trim()).filter(Boolean))
      this.addSql(statement);
  }
}
