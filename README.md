# customparadigm

Custom tooling on top of the [Paradigm ERP](https://www.paradigmerp.com/) REST API. Node 22 + Express, ready for Railway.

## What's here

| Path | Purpose |
| --- | --- |
| `src/paradigm/client.js` | `ParadigmClient`: API key auth, paging (`list`, `listAll`), raw `get/post/put/delete`, typed errors |
| `src/paradigm/endpoints.json` | Catalog of the 67 filterable list endpoints, generated from Swagger (`npm run gen:endpoints`) |
| `src/paradigm/filter.js` | `buildFilter` and `Op` for Paradigm's `?filter=` syntax |
| `src/server.js` | Express server: `/healthz` and a read-only `GET /api/list?path=…` passthrough, allowlisted to the endpoint catalog, protected by basic auth |
| `public/dashboard.html` | **Invoice Dashboard**: pick a date range; shows KPIs and the top 10 customers or invoices from `tblarinvoice` |
| `src/dashboard.js` | Builds the dashboard's SQL from validated dates and summarises the rows |
| `public/index.html` | "Paradigm Explorer", a small page for running list queries in the browser |
| `src/cli.js` | `npm run query` for exploring from the terminal |

## Setup

```bash
npm install
cp .env.example .env   # then fill in PARADIGM_BASE_URL and PARADIGM_API_KEY
npm run dev            # http://localhost:3000
```

Explore from the terminal:

```bash
npm run query -- --list                                              # endpoint catalog
npm run query -- "Customer/{skip}/{take}" "StrCompanyName Contains Lumber" 10
npm run query -- Quote "" 5
```

## Using the client

```js
import { ParadigmClient } from './src/paradigm/client.js';
import { Op } from './src/paradigm/filter.js';

const pd = ParadigmClient.fromEnv();

// GET /api/Customer/0/100?filter=StrCompanyName Contains Lumber and StrBillToAddress IsNotNull
const customers = await pd.list('Customer/{skip}/{take}', {
  take: 100,
  filter: [['StrCompanyName', Op.Contains, 'Lumber'], ['StrBillToAddress', Op.IsNotNull]],
});

// GET /api/Quote?pageNumber=1&size=50  ->  { items, pageNumber, totalPages, hasNextPage }
const quotes = await pd.list('Quote', { pageNumber: 1, size: 50 });

// Walks every page in either style
for await (const c of pd.listAll('Customer/{skip}/{take}', { pageSize: 500 })) { /* ... */ }

await pd.post('SalesOrder', { /* see Swagger for the schema */ });
```

Request/response schemas: Swagger UI at `https://{host}/swagger`, spec at `/swagger/v1/swagger.json` (dev: https://apidev.para-apps.com/swagger/v1/swagger.json).

## Invoice Dashboard

`/dashboard.html` calls `GET /api/dashboard/invoices?start=YYYY-MM-DD&end=YYYY-MM-DD`. The server checks both dates and sends this SQL to Paradigm's `POST /api/Report` (`pd.report(sql)`):

```sql
select strcustomerid, strbilltocompany, curordertotal from tblarinvoice
where dtmdate between '{start}' and '{end} 23:59:59.997'
  and isnull(strcustomerid, '') not in ('CENBUS001')
```

The end date includes the whole day. Customer IDs in `EXCLUDED_CUSTOMERS` (`src/dashboard.js`) are left out. The customer name is the invoice's bill-to company. Rows are totalled in Node: KPIs (total, invoice count, customers, average), plus the top 10 customers by summed total and the top 10 individual invoices. The browser never sends SQL.

## Paradigm API notes

- Base URL: `https://{clientspecifichostname}/api`
- Auth: this project uses the `x-api-key` header. The key has **full access**, so it stays server-side only. JWT (`POST /api/User/Auth/GetToken`) is needed only for `api/User/*` endpoints and isn't implemented yet.
- Paging comes in two styles (the catalog records which one each endpoint uses):
  - **skipTake** (14 endpoints): `{skip}/{take}` in the path; returns a bare array. Some also accept `?properties=` to pick fields.
  - **page** (46 endpoints): `pageNumber`/`size` in the query (or path for EmployeeData); returns `{ items, pageNumber, totalPages, hasNextPage }`.
  - **none** (7 endpoints): just `?filter=`.
- Most entities also have `POST`, `PUT`, `DELETE`, `batch-create`, and `batch-update` routes. Use `pd.post/put/delete`.
- Filtering: `?filter=Field Op Value and Field2 Op2 ...`. Operators: Equals, NotEquals, Between, In, NotIn, GreaterThan, LessThan, GreatherThanOrEqualTo (Paradigm's spelling), LessThanOrEqualTo, StartsWith, EndsWith, Contains, Like, IsNull, IsNotNull, IsNullOrEmptyString, IsNotNullOrEmptyString, IsNullOr0, IsNotNullOr0.

### Still to verify against a live key

- The separator for multi-value `In` / `NotIn` / `Between` values (currently comma-joined)
- How values containing spaces are written in filters
- Whether `pageNumber` is 1-based (assumed 1)
- The format of `properties` (assumed comma-separated)

## Deploying (Railway)

Set `PARADIGM_BASE_URL`, `PARADIGM_API_KEY`, `APP_PASSWORD` and `NODE_ENV=production`. The server won't start in production without `APP_PASSWORD`.
