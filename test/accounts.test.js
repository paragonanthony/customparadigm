import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAccounts, clearAccountCache } from '../src/accounts.js';

const rows = [
  { strAccountID: '6-1000', strDescription: 'Advertising', strAccountType: 'Expense', strHeaderType: 'Detail' },
  { strAccountID: '6-0000', strDescription: 'Expenses', strAccountType: 'Expense', strHeaderType: 'Header' },
  { strAccountID: '1-1100', strDescription: 'Cash On Hand', strAccountType: 'Asset', strHeaderType: 'Cash' },
  { strAccountID: '6-900', strDescription: null, strAccountType: 'Expense', strHeaderType: 'Detail' },
];

test('getAccounts drops headers, slims and sorts, and caches', async () => {
  clearAccountCache();
  let calls = 0;
  const paradigm = { get: async (path) => { calls++; assert.equal(path, 'Account/GetAll'); return rows; } };
  const [a, b] = await Promise.all([getAccounts(paradigm), getAccounts(paradigm)]);
  assert.equal(calls, 1, 'concurrent callers share one fetch');
  assert.deepEqual(a.map((x) => x.id), ['1-1100', '6-900', '6-1000']);
  assert.deepEqual(a[1], { id: '6-900', description: '', type: 'Expense' });
  assert.equal(a, b);
  await getAccounts(paradigm);
  assert.equal(calls, 1, 'served from cache');
  await getAccounts(paradigm, { now: Date.now() + 11 * 60 * 1000 });
  assert.equal(calls, 2, 'refetched after the cache expires');
});

test('a failed fetch is not cached', async () => {
  clearAccountCache();
  let fail = true;
  const paradigm = { get: async () => { if (fail) throw new Error('down'); return rows; } };
  await assert.rejects(getAccounts(paradigm), /down/);
  fail = false;
  assert.equal((await getAccounts(paradigm)).length, 3);
});
