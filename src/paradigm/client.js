import { buildFilter } from './filter.js';

export class ParadigmError extends Error {
  constructor(message, { status, body, method, path } = {}) {
    super(message);
    this.name = 'ParadigmError';
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

/**
 * Minimal client for the Paradigm ERP REST API using API key authentication.
 *
 * Paradigm list endpoints come in two styles (see src/paradigm/endpoints.json):
 *   skip/take   e.g. Customer/{skip}/{take}       returns a bare array
 *   page/size   e.g. Quote?pageNumber=&size=      returns { items, pageNumber, totalPages, hasNextPage }
 * `list` takes the path template and fills in whichever placeholders it has.
 *
 *   const pd = ParadigmClient.fromEnv();
 *   const rows = await pd.list('Customer/{skip}/{take}', { take: 100, filter: [['StrCompanyName', 'Contains', 'Lumber']] });
 *   const page = await pd.list('Quote', { pageNumber: 1, size: 50 });
 */
export class ParadigmClient {
  constructor({ baseUrl, apiKey, timeoutMs = 30_000, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl) throw new Error('ParadigmClient: baseUrl is required');
    if (!apiKey) throw new Error('ParadigmClient: apiKey is required');
    this.apiRoot = baseUrl.replace(/\/+$/, '').replace(/\/api$/i, '') + '/api';
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  static fromEnv(env = process.env) {
    return new ParadigmClient({ baseUrl: env.PARADIGM_BASE_URL, apiKey: env.PARADIGM_API_KEY });
  }

  /** Low-level request. `path` is relative to /api, e.g. "Customer/0/100". */
  async request(method, path, { query, body } = {}) {
    const url = new URL(`${this.apiRoot}/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }

    const headers = { 'x-api-key': this.apiKey, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';

    let res;
    try {
      res = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ParadigmError(`Paradigm ${method} ${path} failed: ${err.message}`, { method, path });
    }

    const text = await res.text();
    let data = text;
    if (text && (res.headers.get('content-type') ?? '').includes('json')) {
      try { data = JSON.parse(text); } catch { /* leave as text */ }
    }
    if (!res.ok) {
      throw new ParadigmError(`Paradigm ${method} ${path} returned ${res.status}`, {
        status: res.status, body: data, method, path,
      });
    }
    return data;
  }

  /**
   * GET a list endpoint. `template` is a path like "Customer/{skip}/{take}" or
   * "Quote". {skip}/{take}/{pageNumber}/{size} placeholders are filled from the
   * options. Otherwise pageNumber and size go in the query string, unless
   * `paging` is 'none' (endpoints with no paging; see endpoints.json). `filter` is a raw string or an array of
   * [field, op, value] conditions (see buildFilter).
   */
  list(template, { skip = 0, take = 100, pageNumber = 1, size = 100, paging, filter, properties, query } = {}) {
    const values = { skip, take, pageNumber, size };
    const used = new Set();
    const path = template.replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in values)) throw new Error(`No value for path parameter {${name}} in ${template}`);
      used.add(name);
      return encodeURIComponent(values[name]);
    });
    const q = { ...query };
    if (paging !== 'none' && !used.has('skip') && !used.has('pageNumber')) Object.assign(q, { pageNumber, size });
    q.filter = Array.isArray(filter) ? buildFilter(filter) : filter;
    if (properties) q.properties = Array.isArray(properties) ? properties.join(',') : properties;
    return this.request('GET', path, { query: q });
  }

  /** Yields every matching record from a list endpoint of either paging style. */
  async *listAll(template, { pageSize = 500, paging, filter, properties, query } = {}) {
    if (paging === 'none') {
      yield* extractRows(await this.list(template, { paging, filter, properties, query }));
      return;
    }
    if (template.includes('{skip}')) {
      for (let skip = 0; ; skip += pageSize) {
        const rows = extractRows(await this.list(template, { skip, take: pageSize, filter, properties, query }));
        yield* rows;
        if (rows.length < pageSize) return;
      }
    }
    for (let pageNumber = 1; ; pageNumber++) {
      const page = await this.list(template, { pageNumber, size: pageSize, filter, properties, query });
      const rows = extractRows(page);
      yield* rows;
      const more = page?.hasNextPage ?? (page?.totalPages ? pageNumber < page.totalPages : rows.length === pageSize);
      if (!more || !rows.length) return;
    }
  }

  /**
   * Runs a SQL query through POST /api/Report and returns the rows.
   * The endpoint is typed as returning a string, so a JSON-encoded result is parsed.
   * Never pass user-supplied SQL: the API key has full access.
   */
  async report(sql) {
    let data = await this.request('POST', 'Report', { body: sql });
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* not JSON; return as-is */ }
    }
    return data;
  }

  get(path, query) { return this.request('GET', path, { query }); }
  post(path, body) { return this.request('POST', path, { body }); }
  put(path, body) { return this.request('PUT', path, { body }); }
  delete(path, body) { return this.request('DELETE', path, { body }); }
}

/** Skip/take endpoints return a bare array; page endpoints wrap rows in `items`. */
export function extractRows(page) {
  if (Array.isArray(page)) return page;
  if (Array.isArray(page?.items)) return page.items;
  return [];
}
