import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { ParadigmClient, ParadigmError } from './paradigm/client.js';
import endpoints from './paradigm/endpoints.json' with { type: 'json' };
import { invoiceSql, summarise } from './dashboard.js';

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
      pageNumber: int(req.query.pageNumber, 1, 0, Number.MAX_SAFE_INTEGER),
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

app.use((err, _req, res, _next) => {
  if (err instanceof ParadigmError) {
    console.error(err.message, err.body ?? '');
    return res.status(err.status && err.status < 500 ? err.status : 502).json({ error: err.message, detail: err.body });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`customparadigm listening on http://localhost:${PORT}`));
