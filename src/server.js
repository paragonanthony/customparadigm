import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { ParadigmClient, ParadigmError } from './paradigm/client.js';
import endpoints from './paradigm/endpoints.json' with { type: 'json' };
import { invoiceSql, summarise } from './dashboard.js';
import { SECTIONS, buildUpdate, isEmployeeId } from './employees.js';
import { getAccounts } from './accounts.js';

const PORT = Number(process.env.PORT) || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !APP_PASSWORD) {
  // The API key has full access to Paradigm, so never expose this server unauthenticated.
  console.error('APP_PASSWORD must be set in production.');
  process.exit(1);
}

const paradigm = ParadigmClient.fromEnv();
const app = express();
app.disable('x-powered-by');
app.use(helmet());

app.get('/healthz', (_req, res) => res.json({ ok: true }));

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Basic auth for everything below. Any username is accepted; only the password is checked.
app.use((req, res, next) => {
  if (!APP_PASSWORD) return next();
  const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const password = decoded.slice(decoded.indexOf(':') + 1);
    if (safeEqual(password, APP_PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="customparadigm"').status(401).send('Authentication required');
});

app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

// Read-only passthrough, limited to the list endpoints in endpoints.json.
const byPath = new Map(endpoints.map((e) => [e.path, e]));
app.get('/api/endpoints', (_req, res) => res.json(endpoints));

const int = (v, def, min, max) => Math.min(max, Math.max(min, Number.parseInt(v, 10) || def));
app.get('/api/list', async (req, res, next) => {
  const endpoint = byPath.get(req.query.path);
  if (!endpoint) return res.status(400).json({ error: 'Unknown endpoint' });
  try {
    res.json(await paradigm.list(endpoint.path, {
      paging: endpoint.paging,
      skip: int(req.query.skip, 0, 0, Number.MAX_SAFE_INTEGER),
      take: int(req.query.take, 100, 1, 500),
      pageNumber: int(req.query.pageNumber, 1, 1, Number.MAX_SAFE_INTEGER), // 1-based; 0 makes Paradigm return 500
      size: int(req.query.size, 100, 1, 500),
      filter: req.query.filter || undefined,
      properties: endpoint.query.includes('properties') ? req.query.properties || undefined : undefined,
    }));
  } catch (err) {
    next(err);
  }
});

// Invoice dashboard. The SQL is built server-side from validated dates only.
app.get('/api/dashboard/invoices', async (req, res, next) => {
  let sql;
  try {
    sql = invoiceSql(req.query.start, req.query.end);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const rows = await paradigm.report(sql);
    if (!Array.isArray(rows)) {
      console.error('Unexpected report response:', rows);
      return res.status(502).json({ error: 'Unexpected response from the Paradigm report endpoint' });
    }
    res.json({ start: req.query.start, end: req.query.end, ...summarise(rows) });
  } catch (err) {
    next(err);
  }
});

// Employees: list, detail, and update via /api/EmployeeData.
app.get('/api/employees/fields', (_req, res) => res.json(SECTIONS));

app.get('/api/accounts', async (_req, res, next) => {
  try {
    res.json(await getAccounts(paradigm));
  } catch (err) {
    next(err);
  }
});

// All employees, with just the columns the list page shows. Paradigm can't sort,
// so the page filters, sorts and pages this list itself.
const MAX_EMPLOYEES = 5000;
app.get('/api/employees', async (_req, res, next) => {
  try {
    const items = [];
    for await (const e of paradigm.listAll('EmployeeData/{pageNumber}/{size}', { pageSize: 200 })) {
      items.push({
        strEmployeeID: e.strEmployeeID,
        strFirstName: e.strFirstName,
        strMiddleName: e.strMiddleName,
        strLastName: e.strLastName,
        strDepartment: e.strDepartment,
        strSendToEmail: e.strSendToEmail,
        ysnSalesman: e.ysnSalesman,
        dtmTerminated: e.dtmTerminated,
      });
      if (items.length >= MAX_EMPLOYEES) break;
    }
    res.json({ items, truncated: items.length >= MAX_EMPLOYEES });
  } catch (err) {
    next(err);
  }
});

app.get('/api/employees/:id', async (req, res, next) => {
  if (!isEmployeeId(req.params.id)) return res.status(400).json({ error: 'Invalid employee ID' });
  try {
    res.json(await paradigm.get(`EmployeeData/${encodeURIComponent(req.params.id)}`));
  } catch (err) {
    next(err);
  }
});

// Body: { changes: { field: value, ... }, lastModified }. lastModified is the
// dtmLastModified the page loaded; if the record has changed since, the save is refused.
app.put('/api/employees/:id', express.json({ limit: '100kb' }), async (req, res, next) => {
  const { id } = req.params;
  if (!isEmployeeId(id)) return res.status(400).json({ error: 'Invalid employee ID' });
  const path = `EmployeeData/${encodeURIComponent(id)}`;
  try {
    const current = await paradigm.get(path);
    if (req.body?.lastModified !== undefined && req.body.lastModified !== current.dtmLastModified) {
      return res.status(409).json({ error: 'This employee was changed by someone else after you opened it. Reload to see the latest version.' });
    }
    let body;
    try {
      body = buildUpdate(current, req.body?.changes);
      const expense = req.body?.changes?.strExpenseID;
      if (expense && !(await getAccounts(paradigm)).some((a) => a.id === body.strExpenseID)) {
        throw new RangeError(`Expense account ${body.strExpenseID} doesn't exist`);
      }
    } catch (err) {
      if (err instanceof RangeError) return res.status(400).json({ error: err.message });
      throw err;
    }
    const updated = await paradigm.request('PUT', path, { body, query: { excludeNullValues: 'false' } });
    console.log(`Employee ${id} updated: ${Object.keys(req.body.changes ?? {}).join(', ')}`);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof ParadigmError) {
    console.error(err.message, err.body ?? '');
    return res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message, detail: err.body });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`customparadigm listening on http://localhost:${PORT}`);
  // Warm the slow account list so the first employee edit page doesn't wait on it.
  getAccounts(paradigm).catch((err) => console.error('Could not preload accounts:', err.message));
});
