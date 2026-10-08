// Invoice dashboard: runs a fixed SQL report for a date range and summarises it.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validates a YYYY-MM-DD string and returns it as an unambiguous SQL Server literal (YYYYMMDD). */
export function sqlDate(value) {
  const m = ISO_DATE.exec(value ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

// Customer IDs left out of the dashboard entirely.
export const EXCLUDED_CUSTOMERS = ['CENBUS001'];

export function invoiceSql(start, end) {
  const s = sqlDate(start);
  const e = sqlDate(end);
  if (!s || !e) throw new RangeError('Dates must be valid YYYY-MM-DD values');
  if (s > e) throw new RangeError('Start date must be on or before end date');
  // The end bound includes the whole end day, in case dtmdate carries a time.
  const excluded = EXCLUDED_CUSTOMERS.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  return `select strcustomerid, strbilltocompany, curordertotal from tblarinvoice`
    + ` where dtmdate between '${s}' and '${e} 23:59:59.997'`
    + ` and isnull(strcustomerid, '') not in (${excluded})`;
}

// Column casing in the report output isn't guaranteed, so look keys up case-insensitively.
function field(row, name) {
  const key = Object.keys(row ?? {}).find((k) => k.toLowerCase() === name);
  return key === undefined ? undefined : row[key];
}

export function summarise(rows, top = 10) {
  const invoices = (Array.isArray(rows) ? rows : []).map((r) => ({
    customerId: String(field(r, 'strcustomerid') ?? '').trim() || '(none)',
    customerName: String(field(r, 'strbilltocompany') ?? '').trim(),
    total: Number(field(r, 'curordertotal')) || 0,
  }));

  const byCustomer = new Map();
  for (const inv of invoices) {
    const c = byCustomer.get(inv.customerId) ?? { customerId: inv.customerId, customerName: '', total: 0, invoices: 0 };
    // Bill-to name can vary between invoices; keep the first non-blank one.
    c.customerName ||= inv.customerName;
    c.total += inv.total;
    c.invoices += 1;
    byCustomer.set(inv.customerId, c);
  }

  const grandTotal = invoices.reduce((sum, i) => sum + i.total, 0);
  return {
    totals: {
      amount: grandTotal,
      invoices: invoices.length,
      customers: byCustomer.size,
      average: invoices.length ? grandTotal / invoices.length : 0,
    },
    topCustomers: [...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, top),
    topInvoices: [...invoices].sort((a, b) => b.total - a.total).slice(0, top),
  };
}
