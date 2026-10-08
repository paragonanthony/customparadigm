// Regenerates src/paradigm/endpoints.json, the catalog of filterable list endpoints,
// from the Paradigm Swagger spec.
//   npm run gen:endpoints                     (uses PARADIGM_BASE_URL)
//   npm run gen:endpoints -- ./swagger.json   (local file)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const src = process.argv[2]
  ?? `${(process.env.PARADIGM_BASE_URL ?? '').replace(/\/+$/, '').replace(/\/api$/i, '')}/swagger/v1/swagger.json`;

const spec = /^https?:/.test(src)
  ? await (await fetch(src)).json()
  : JSON.parse(await readFile(src, 'utf8'));

const endpoints = [];
for (const [route, ops] of Object.entries(spec.paths)) {
  const get = ops.get;
  // Only list endpoints that take a filter. JWT-only /api/user/* endpoints are skipped.
  if (!get || /^\/api\/user\//i.test(route)) continue;
  const params = get.parameters ?? [];
  if (!params.some((p) => p.name === 'filter')) continue;

  const names = new Set(params.map((p) => p.name));
  const paging = names.has('skip') && names.has('take') ? 'skipTake'
    : names.has('pageNumber') && names.has('size') ? 'page'
    : 'none';

  endpoints.push({
    name: get.tags?.[0] ?? route.split('/')[2],
    path: route.replace(/^\/api\//, ''),
    paging,
    query: params.filter((p) => p.in === 'query' && p.name !== 'filter').map((p) => p.name),
  });
}
endpoints.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

const out = path.join(import.meta.dirname, '..', 'src', 'paradigm', 'endpoints.json');
await writeFile(out, JSON.stringify(endpoints, null, 2) + '\n');
console.log(`Wrote ${endpoints.length} endpoints to ${path.relative(process.cwd(), out)}`);
