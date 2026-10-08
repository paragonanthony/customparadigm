import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceSql, sqlDate, summarise } from '../src/dashboard.js';
import { ParadigmClient } from '../src/paradigm/client.js';

test('invoiceSql builds the query with an inclusive end day and excludes CENBUS001', () => {
  assert.equal(
    invoiceSql('2026-01-01', '2026-03-31'),
    "select strcustomerid, strbilltocompany, curordertotal from tblarinvoice"
      + " where dtmdate between '20260101' and '20260331 23:59:59.997'"
      + " and isnull(strcustomerid, '') not in ('CENBUS001')",
  );
});

test('invoiceSql rejects anything that is not a real date', () => {
  for (const bad of ["2026-01-01' or 1=1 --", '2026-02-30', '01/02/2026', '', undefined]) {
    assert.throws(() => invoiceSql(bad, '2026-12-31'), RangeError, String(bad));
  }
  assert.throws(() => invoiceSql('2026-05-01', '2026-04-01'), /on or before/);
  assert.equal(sqlDate('2024-02-29'), '20240229');
});

test('summarise totals, groups by customer and ranks the top 10', () => {
  const rows = [
    { StrCustomerId: 'A ', StrBillToCompany: ' ', CurOrderTotal: 100 },
    { strcustomerid: 'B', curordertotal: '250.5' },
    { strcustomerid: 'A', strbilltocompany: 'Acme Lumber ', curordertotal: 200 },
    { strcustomerid: null, curordertotal: 5 },
    ...Array.from({ length: 12 }, (_, i) => ({ strcustomerid: `C${i}`, curordertotal: i })),
  ];
  const s = summarise(rows);
  assert.equal(s.totals.invoices, 16);
  assert.equal(s.totals.customers, 15);
  assert.equal(s.totals.amount, 100 + 250.5 + 200 + 5 + 66);
  assert.deepEqual(s.topCustomers[0], { customerId: 'A', customerName: 'Acme Lumber', total: 300, invoices: 2 });
  assert.equal(s.topCustomers[1].customerId, 'B');
  assert.equal(s.topCustomers.length, 10);
  assert.deepEqual(s.topInvoices.slice(0, 2), [
    { customerId: 'B', customerName: '', total: 250.5 },
    { customerId: 'A', customerName: 'Acme Lumber', total: 200 },
  ]);
});

test('report posts the SQL as a JSON string and parses a string result', async () => {
  const calls = [];
  const pd = new ParadigmClient({
    baseUrl: 'https://h', apiKey: 'k',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(JSON.stringify([{ strcustomerid: 'A', curordertotal: 1 }]));
    },
  });
  assert.deepEqual(await pd.report('select 1'), [{ strcustomerid: 'A', curordertotal: 1 }]);
  assert.equal(calls[0].url, 'https://h/api/Report');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '"select 1"');
});
