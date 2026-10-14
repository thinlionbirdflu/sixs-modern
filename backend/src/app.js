import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { RequestContext, sql, wrap } from '@mikro-orm/core';
import { resources, parseId, updateVersion } from './resources.js';
import { Policy, resourceEntities } from './entities.js';

export function createApp(orm, token = '') {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', (req, res, next) => {
    if (!token) return next();
    const supplied = Buffer.from(req.get('authorization') || '');
    const expected = Buffer.from('Bearer ' + token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return res.status(401).json({ error: 'Unauthorized' });
    next();
  });
  app.use('/api', (_req, _res, next) => RequestContext.create(orm.em, next));
  app.get('/api/reports/sales', async (req, res) => {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 1900 || year > 9998)
      return res.status(400).json({ error: 'Invalid year' });
    const employeeId = req.query.employee_id ? parseId(req.query.employee_id) : null;
    const where = { date_written: { $gte: year + '-01-01', $lt: (year + 1) + '-01-01' } };
    if (employeeId !== null) where.employee_id = employeeId;
    const data = await orm.em.createQueryBuilder(Policy, 'p')
      .select([
        sql`to_char(date_trunc('month', p.date_written), 'YYYY-MM')`.as('month'),
        sql`p.employee_id`.as('employee_id'), sql`e.first_name || ' ' || e.last_name`.as('employee'),
        sql`p.policy_type_id`.as('policy_type_id'), sql`t.name`.as('policy_type'),
        sql`count(*)::integer`.as('policy_count'), sql`sum(p.premium)::text`.as('total_premium'),
      ])
      .innerJoin('p.employee_id', 'e').innerJoin('p.policy_type_id', 't')
      .where(where)
      .groupBy([sql`date_trunc('month', p.date_written)`, 'p.employee_id', 'e.first_name', 'e.last_name', 'p.policy_type_id', 't.name'])
      .orderBy({ [sql.ref('month')]: 'asc', [sql.ref('employee')]: 'asc', [sql.ref('policy_type')]: 'asc' })
      .execute('all', { mapResults: false });
    res.json({ data });
  });
  for (const [path, resource] of Object.entries(resources)) {
    const base = '/api/' + path;
    const entity = resourceEntities[path];
    app.get(base, async (req, res) => {
      const limit = Number(req.query.limit || 100), offset = Number(req.query.offset || 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
          !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647)
        return res.status(400).json({ error: 'Invalid pagination' });
      const where = {};
      if (req.query.q) {
        if (typeof req.query.q !== 'string' || req.query.q.length > 200)
          return res.status(400).json({ error: 'Invalid search' });
        if (resource.search.length) {
          // Search means literal substring; escape SQL wildcard characters.
          const pattern = '%' + req.query.q.replace(/[\\%_]/g, '\\$&') + '%';
          where.$or = resource.search.map(field => ({ [field]: { $ilike: pattern } }));
        }
      }
      if (req.query.customer_id && 'customer_id' in resource.schema.shape)
        where.customer_id = parseId(req.query.customer_id);
      const records = await orm.em.find(entity, where, { orderBy: { id: 'desc' }, limit, offset });
      res.json({ data: records.map(record => wrap(record).toObject()), limit, offset });
    });
    app.get(base + '/:id', async (req, res) => {
      const record = await orm.em.findOne(entity, { id: parseId(req.params.id) });
      if (!record) return res.status(404).json({ error: 'Record not found' });
      res.json({ data: wrap(record).toObject() });
    });
    app.post(base, async (req, res) => {
      const data = resource.schema.parse(req.body);
      const record = orm.em.create(entity, data);
      orm.em.persist(record);
      await orm.em.flush();
      await orm.em.refresh(record);
      res.status(201).json({ data: wrap(record).toObject() });
    });
    app.patch(base + '/:id', async (req, res) => {
      const recordId = parseId(req.params.id);
      const { version, ...input } = req.body || {};
      const expectedVersion = updateVersion.parse(version);
      const data = resource.schema.partial().parse(input);
      if (!Object.keys(data).length) return res.status(400).json({ error: 'No fields supplied' });
      // Match and advance the version atomically, including no-op edits.
      const records = await orm.em.createQueryBuilder(entity)
        .update({ ...data, updated_at: new Date(), version: expectedVersion + 1 })
        .where({ id: recordId, version: expectedVersion }).returning('*').execute('all');
      if (!records.length) return res.status(409).json({ error: 'Record changed or no longer exists. Reload before saving.' });
      res.json({ data: records[0] });
    });
    app.delete(base + '/:id', async (req, res) => {
      const recordId = parseId(req.params.id);
      const version = updateVersion.parse(req.body?.version);
      const deleted = await orm.em.nativeDelete(entity, { id: recordId, version });
      if (!deleted) return res.status(409).json({ error: 'Record changed or no longer exists. Reload before deleting.' });
      res.status(204).end();
    });
  }
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
    if (['23505', '23503', '23001'].includes(err.code)) return res.status(409).json({ error: 'Duplicate record or a related record prevents this operation.' });
    if (['23514', '23502', '22007', '22008', '22003'].includes(err.code)) return res.status(400).json({ error: 'Invalid database value' });
    if (err.status === 400 || err.status === 413) return res.status(err.status).json({ error: 'Invalid request' });
    console.error('API failure:', err.code || err.name); // Do not log customer fields.
    res.status(500).json({ error: 'Unable to complete request' });
  });
  return app;
}
