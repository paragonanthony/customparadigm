// GL accounts from /api/Account/GetAll, cached because the call is slow (~7s on dev).

const TTL_MS = 10 * 60 * 1000;

let cache = null;     // { at, accounts }
let inflight = null;  // promise for a fetch in progress

/**
 * Returns postable GL accounts as [{ id, description, type }], sorted by ID.
 * Header accounts are left out since transactions can't be posted to them.
 */
export async function getAccounts(paradigm, { now = Date.now() } = {}) {
  if (cache && now - cache.at < TTL_MS) return cache.accounts;
  inflight ??= paradigm.get('Account/GetAll')
    .then((rows) => {
      const accounts = rows
        .filter((a) => a.strAccountID && a.strHeaderType !== 'Header')
        .map((a) => ({ id: a.strAccountID, description: a.strDescription ?? '', type: a.strAccountType ?? '' }))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      cache = { at: Date.now(), accounts };
      return accounts;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

export function clearAccountCache() {
  cache = null;
}
