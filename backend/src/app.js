import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { resources, parseId, updateVersion } from './resources.js';

export function createApp(pool, token = '') {
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
  app.get('/api/reports/sales', async (req, res) => {
    const year = Number(req.query.year || new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 1900 || year > 9998)
      return res.status(400).json({ error: 'Invalid year' });
    const employeeId = req.query.employee_id ? parseId(req.query.employee_id) : null;
    const result = await pool.query(`
      SELECT to_char(date_trunc('month', p.date_written), 'YYYY-MM') AS month,
             p.employee_id, e.first_name || ' ' || e.last_name AS employee,
             p.policy_type_id, t.name AS policy_type,
             count(*)::integer AS policy_count, sum(p.premium)::text AS total_premium
      FROM policies p JOIN employees e ON e.id = p.employee_id
      JOIN policy_types t ON t.id = p.policy_type_id
      WHERE p.date_written >= $1::date AND p.date_written < $2::date
        AND ($3::integer IS NULL OR p.employee_id = $3)
      GROUP BY date_trunc('month', p.date_written), p.employee_id, e.first_name,
               e.last_name, p.policy_type_id, t.name
      ORDER BY month, employee, policy_type
    `, [year + '-01-01', (year + 1) + '-01-01', employeeId]);
    res.json({ data: result.rows });
  });
  for (const [path, resource] of Object.entries(resources)) {
    // All SQL identifiers come from this internal allowlist, never from a request.
    const base = '/api/' + path;
    const table = resource.table;
    app.get(base, async (req, res) => {
      const limit = Number(req.query.limit || 100), offset = Number(req.query.offset || 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
          !Number.isSafeInteger(offset) || offset < 0 || offset > 2147483647)
        return res.status(400).json({ error: 'Invalid pagination' });
      const values = [], where = [];
      if (req.query.q) {
        if (typeof req.query.q !== 'string' || req.query.q.length > 200)
          return res.status(400).json({ error: 'Invalid search' });
        if (resource.search.length) {
          // Escape wildcard characters: search means literal substring.
          values.push('%' + req.query.q.replace(/[\\%_]/g, '\\$&') + '%');
          where.push('(' + resource.search.map(c => c + ' ILIKE $' + values.length).join(' OR ') + ')');
        }
      }
      if (req.query.customer_id && 'customer_id' in resource.schema.shape) {
        values.push(parseId(req.query.customer_id));
        where.push('customer_id = $' + values.length);
      }
      values.push(limit, offset);
      const result = await pool.query('SELECT * FROM ' + table +
        (where.length ? ' WHERE ' + where.join(' AND ') : '') +
        ' ORDER BY id DESC LIMIT $' + (values.length - 1) + ' OFFSET $' + values.length, values);
      res.json({ data: result.rows, limit, offset });
    });
    app.get(base + '/:id', async (req, res) => {
      const result = await pool.query('SELECT * FROM ' + table + ' WHERE id = $1', [parseId(req.params.id)]);
      if (!result.rows.length) return res.status(404).json({ error: 'Record not found' });
      res.json({ data: result.rows[0] });
    });
    app.post(base, async (req, res) => {
      const data = resource.schema.parse(req.body), columns = Object.keys(data);
      const result = await pool.query('INSERT INTO ' + table + ' (' + columns.join(', ') +
        ') VALUES (' + columns.map((_, i) => '$' + (i + 1)).join(', ') + ') RETURNING *', Object.values(data));
      res.status(201).json({ data: result.rows[0] });
    });
    app.patch(base + '/:id', async (req, res) => {
      const recordId = parseId(req.params.id);
      const { version, ...input } = req.body || {};
      const expectedVersion = updateVersion.parse(version);
      const data = resource.schema.partial().parse(input), columns = Object.keys(data);
      if (!columns.length) return res.status(400).json({ error: 'No fields supplied' });
      const values = [...Object.values(data), recordId, expectedVersion];
      const result = await pool.query('UPDATE ' + table + ' SET ' +
        columns.map((c, i) => c + ' = $' + (i + 1)).join(', ') +
        ', updated_at = now(), version = version + 1 WHERE id = $' + (values.length - 1) +
        ' AND version = $' + values.length + ' RETURNING *', values);
      if (!result.rows.length) return res.status(409).json({ error: 'Record changed or no longer exists. Reload before saving.' });
      res.json({ data: result.rows[0] });
    });
    app.delete(base + '/:id', async (req, res) => {
      const recordId = parseId(req.params.id);
      const version = updateVersion.parse(req.body?.version);
      const result = await pool.query('DELETE FROM ' + table + ' WHERE id = $1 AND version = $2 RETURNING id', [recordId, version]);
      if (!result.rows.length) return res.status(409).json({ error: 'Record changed or no longer exists. Reload before deleting.' });
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
