import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFilter, Op } from '../src/paradigm/filter.js';
import { ParadigmClient, ParadigmError } from '../src/paradigm/client.js';

test('buildFilter joins conditions with "and"', () => {
  assert.equal(
    buildFilter([['StrCompanyName', Op.Contains, 'Lumber'], ['StrBillToAddress', Op.IsNotNull]]),
    'StrCompanyName Contains Lumber and StrBillToAddress IsNotNull',
  );
});

test('buildFilter rejects bad fields, unknown ops and missing values', () => {
  assert.throws(() => buildFilter([['bad field', Op.Equals, 1]]));
  assert.throws(() => buildFilter([['Field', 'Nope', 1]]));
  assert.throws(() => buildFilter([['Field', Op.Equals]]));
});

function fakeFetch(calls, response = { status: 200, body: [] }) {
  return async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status, headers: { 'content-type': 'application/json' },
    });
  };
}

test('list builds the paged URL, filter query and api key header', async () => {
  const calls = [];
  const pd = new ParadigmClient({ baseUrl: 'https://host.example/', apiKey: 'k', fetchImpl: fakeFetch(calls) });
  await pd.list('Customer/{skip}/{take}', { skip: 0, take: 100, filter: [['StrCompanyName', Op.Contains, 'Lumber']] });
  assert.equal(calls[0].url, 'https://host.example/api/Customer/0/100?filter=StrCompanyName+Contains+Lumber');
  assert.equal(calls[0].init.headers['x-api-key'], 'k');
});

test('baseUrl ending in /api is not doubled', () => {
  const pd = new ParadigmClient({ baseUrl: 'https://host.example/api', apiKey: 'k' });
  assert.equal(pd.apiRoot, 'https://host.example/api');
});

test('non-2xx responses throw ParadigmError with status and body', async () => {
  const pd = new ParadigmClient({
    baseUrl: 'https://host.example', apiKey: 'k',
    fetchImpl: fakeFetch([], { status: 401, body: { message: 'nope' } }),
  });
  await assert.rejects(pd.get('Customer/0/1'), (err) =>
    err instanceof ParadigmError && err.status === 401 && err.body.message === 'nope');
});

test('listAll pages until a short page', async () => {
  const calls = [];
  const pages = [[1, 2], [3, 4], [5]];
  const pd = new ParadigmClient({
    baseUrl: 'https://h', apiKey: 'k',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json(pages[calls.length - 1]);
    },
  });
  const all = [];
  for await (const r of pd.listAll('Items/GetItems/{skip}/{take}', { pageSize: 2 })) all.push(r);
  assert.deepEqual(all, [1, 2, 3, 4, 5]);
  assert.deepEqual(calls.map((u) => new URL(u).pathname),
    ['/api/Items/GetItems/0/2', '/api/Items/GetItems/2/2', '/api/Items/GetItems/4/2']);
});

test('page-style endpoints put pageNumber/size in the query and follow hasNextPage', async () => {
  const calls = [];
  const pages = [
    { items: [1, 2], pageNumber: 1, totalPages: 2, hasNextPage: true },
    { items: [3], pageNumber: 2, totalPages: 2, hasNextPage: false },
  ];
  const pd = new ParadigmClient({
    baseUrl: 'https://h', apiKey: 'k',
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      return Response.json(pages[calls.length - 1]);
    },
  });
  const all = [];
  for await (const r of pd.listAll('Quote', { pageSize: 2 })) all.push(r);
  assert.deepEqual(all, [1, 2, 3]);
  assert.equal(calls[0].pathname, '/api/Quote');
  assert.equal(calls[1].search, '?pageNumber=2&size=2');
});

test('path placeholders for page/size are filled in', async () => {
  const calls = [];
  const pd = new ParadigmClient({ baseUrl: 'https://h', apiKey: 'k', fetchImpl: fakeFetch(calls, { status: 200, body: { items: [] } }) });
  await pd.list('EmployeeData/{pageNumber}/{size}', { pageNumber: 3, size: 20 });
  assert.equal(calls[0].url, 'https://h/api/EmployeeData/3/20');
});

test('paging "none" sends no paging params', async () => {
  const calls = [];
  const pd = new ParadigmClient({ baseUrl: 'https://h', apiKey: 'k', fetchImpl: fakeFetch(calls) });
  await pd.list('Job', { paging: 'none', filter: 'StrJobId Equals 1' });
  assert.equal(calls[0].url, 'https://h/api/Job?filter=StrJobId+Equals+1');
});
