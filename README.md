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
| `public/employees.html`, `employee.html` | **Employees**: searchable list with Edit links, and a detail page for editing a record |
| `src/employees.js` | Editable employee fields and the save logic |
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

## Employees

`/employees.html` lists employees. The server loads them all from `GET /api/EmployeeData/{pageNumber}/{size}` (up to 5,000), because Paradigm can't sort. The page then filters, sorts and pages them itself.

- Only **active** employees (no `dtmTerminated`) are shown by default. Tick **Show all** to include terminated ones.
- Click any column header to sort by it, and click again to reverse.
- Search matches ID, name, department or email as you type.
- The search, Show all and sort settings are kept in the URL.

**Edit** opens `/employee.html?id={strEmployeeID}`.

Saving sends only the fields you changed to `PUT /api/employees/:id`. The server then:
1. Loads the current record, and refuses with 409 if `dtmLastModified` no longer matches what the page loaded (someone else saved in the meantime).
2. Applies only the editable fields defined in `SECTIONS` in `src/employees.js`, and validates their types. First name is required.
3. Sends the full record to `PUT /api/EmployeeData/{id}?excludeNullValues=false`, so cleared fields are cleared and fields the form doesn't show (such as `strEditLock`) are kept.

To add or remove fields on the form, edit `SECTIONS`. **Expense account** is a dropdown of GL accounts from `GET /api/Account/GetAll`, excluding header accounts. The list is cached for 10 minutes (`src/accounts.js`) and loaded at startup, because the call is slow. The server rejects account IDs that aren't in the list.

## Paradigm API notes

- Base URL: `https://{clientspecifichostname}/api`
- Auth: this project uses the `x-api-key` header. The key has **full access**, so it stays server-side only. JWT (`POST /api/User/Auth/GetToken`) is needed only for `api/User/*` endpoints and isn't implemented yet.
- Paging comes in two styles (the catalog records which one each endpoint uses):
  - **skipTake** (14 endpoints): `{skip}/{take}` in the path; returns a bare array. Some also accept `?properties=` to pick fields.
  - **page** (46 endpoints): `pageNumber`/`size` in the query (or path for EmployeeData); returns `{ items, pageNumber, totalPages, hasNextPage }`.
  - **none** (7 endpoints): just `?filter=`.
- Most entities also have `POST`, `PUT`, `DELETE`, `batch-create`, and `batch-update` routes. Use `pd.post/put/delete`.
- Filtering: `?filter=Field Op Value and Field2 Op2 ...`. Operators: Equals, NotEquals, Between, In, NotIn, GreaterThan, LessThan, GreatherThanOrEqualTo (Paradigm's spelling), LessThanOrEqualTo, StartsWith, EndsWith, Contains, Like, IsNull, IsNotNull, IsNullOrEmptyString, IsNotNullOrEmptyString, IsNullOr0, IsNotNullOr0.

### Verified against the dev API

- `POST /api/Report` returns the rows as a JSON-encoded string, which `pd.report()` parses. **Columns that are NULL are left out of each row.** Bad SQL comes back as 400 with the SQL Server message in `detail`.
- Filters: values with spaces work as-is (`StrCompanyName Contains Cash Customer`) or in double quotes, but not in single quotes. `In` takes a comma-separated list (`StrCustomerId In CASH,STR001`). An unknown field gives 400 `Invalid filter field`.
- `pageNumber` starts at 1. Page 0 makes Paradigm return 500.
- `properties` takes a comma-separated list of fields and isn't case-sensitive. With it, the response keys use database casing (`StrCustomerID`) instead of the usual camelCase (`strCustomerId`).
- `.env`: the API key must be quoted if it contains `#`, which otherwise starts a comment.

## Deploying (Railway)

Set `PARADIGM_BASE_URL`, `PARADIGM_API_KEY`, `APP_PASSWORD` and `NODE_ENV=production`. The server won't start in production without `APP_PASSWORD`.
