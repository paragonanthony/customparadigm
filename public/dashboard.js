const form = document.getElementById('range');
const statusEl = document.getElementById('status');
const chart = document.getElementById('chart');
const tooltip = document.getElementById('tooltip');
const table = document.getElementById('table');
const chartTitle = document.getElementById('chart-title');

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
const moneyShort = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat();
const pct = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });

let data = null;

// --- dates ---------------------------------------------------------------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function preset(name) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (name) {
    case 'month': return [new Date(y, m, 1), today];
    case 'quarter': return [new Date(y, m - (m % 3), 1), today];
    case 'last12': return [new Date(y - 1, m, today.getDate() + 1), today];
    default: return [new Date(y, 0, 1), today];
  }
}

function setRange([start, end]) {
  form.elements.start.value = iso(start);
  form.elements.end.value = iso(end);
}

function readState() {
  const p = new URLSearchParams(location.search);
  if (p.get('start') && p.get('end')) {
    form.elements.start.value = p.get('start');
    form.elements.end.value = p.get('end');
  } else {
    setRange(preset('ytd'));
  }
}

// --- rendering -----------------------------------------------------------
function el(tag, props = {}, text) {
  const e = Object.assign(document.createElement(tag), props);
  if (text !== undefined) e.textContent = text;
  return e;
}

function mode() {
  return form.ownerDocument.querySelector('input[name="mode"]:checked').value;
}

function renderKpis(t) {
  document.getElementById('kpi-amount').textContent = money.format(t.amount);
  document.getElementById('kpi-invoices').textContent = count.format(t.invoices);
  document.getElementById('kpi-customers').textContent = count.format(t.customers);
  document.getElementById('kpi-average').textContent = money.format(t.average);
}

function items() {
  if (!data) return [];
  return mode() === 'customers'
    ? data.topCustomers.map((c) => ({ label: c.customerId, total: c.total, invoices: c.invoices }))
    : data.topInvoices.map((i) => ({ label: i.customerId, total: i.total }));
}

function renderChart() {
  const list = items();
  chartTitle.textContent = mode() === 'customers'
    ? 'Top 10 customers by invoiced total'
    : 'Top 10 invoices by total';
  chart.replaceChildren();
  hideTooltip();
  if (!list.length) {
    chart.append(el('div', { className: 'empty' }, data ? 'No invoices in this date range.' : 'Choose a date range and select Run.'));
    return;
  }
  const max = Math.max(...list.map((d) => d.total), 0) || 1;
  list.forEach((d, i) => {
    const label = el('div', { className: 'bar-label', title: d.label }, d.label);
    const track = el('div', { className: 'bar-track', tabIndex: 0 });
    track.setAttribute('aria-label', `${i + 1}. ${d.label}: ${money.format(d.total)}`);
    const bar = el('div', { className: 'bar' });
    bar.style.width = `${Math.max(0, d.total / max) * 85}%`;
    track.append(bar);
    // Label only the leader directly; the rest are on hover and in the table.
    if (i === 0) track.append(el('span', { className: 'bar-value' }, moneyShort.format(d.total)));
    const show = () => showTooltip(track, d, i);
    track.addEventListener('mouseenter', show);
    track.addEventListener('focus', show);
    track.addEventListener('mouseleave', hideTooltip);
    track.addEventListener('blur', hideTooltip);
    chart.append(label, track);
  });
}

function showTooltip(track, d, i) {
  tooltip.replaceChildren(
    el('strong', {}, `${i + 1}. ${d.label}`),
    el('span', {}, money.format(d.total)),
  );
  if (d.invoices !== undefined) {
    tooltip.append(el('br'), el('span', {}, `${count.format(d.invoices)} invoice${d.invoices === 1 ? '' : 's'} · ${pct.format(d.total / (data.totals.amount || 1))} of total`));
  }
  tooltip.hidden = false;
  const card = chart.parentElement.getBoundingClientRect();
  const bar = track.firstElementChild.getBoundingClientRect();
  const left = Math.min(bar.right - card.left + 8, card.width - tooltip.offsetWidth - 8);
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${bar.top - card.top + bar.height / 2 - tooltip.offsetHeight / 2}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function renderTable() {
  const list = items();
  const byCustomer = mode() === 'customers';
  const cols = byCustomer
    ? [['#', 'num'], ['Customer'], ['Invoices', 'num'], ['Total', 'num'], ['Share', 'num']]
    : [['#', 'num'], ['Customer'], ['Invoice total', 'num'], ['Share', 'num']];
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  cols.forEach(([name, cls]) => head.append(el('th', { className: cls ?? '' }, name)));
  const body = table.createTBody();
  list.forEach((d, i) => {
    const tr = body.insertRow();
    const share = pct.format(d.total / (data.totals.amount || 1));
    const cells = byCustomer
      ? [[i + 1, 'num'], [d.label], [count.format(d.invoices), 'num'], [money.format(d.total), 'num'], [share, 'num']]
      : [[i + 1, 'num'], [d.label], [money.format(d.total), 'num'], [share, 'num']];
    cells.forEach(([v, cls]) => tr.append(el('td', { className: cls ?? '' }, String(v))));
  });
}

function render() {
  renderChart();
  renderTable();
}

// --- loading -------------------------------------------------------------
async function load() {
  const start = form.elements.start.value;
  const end = form.elements.end.value;
  if (!start || !end) return;
  if (start > end) {
    statusEl.className = 'error';
    statusEl.textContent = 'Start date must be on or before end date.';
    return;
  }
  history.replaceState(null, '', `?${new URLSearchParams({ start, end })}`);
  statusEl.className = '';
  statusEl.textContent = 'Loading…';
  try {
    const res = await fetch(`/api/dashboard/invoices?${new URLSearchParams({ start, end })}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error + (body.detail ? `: ${JSON.stringify(body.detail)}` : ''));
    data = body;
    statusEl.textContent = '';
    renderKpis(data.totals);
    render();
  } catch (err) {
    data = null;
    statusEl.className = 'error';
    statusEl.textContent = err.message;
    render();
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  load();
});
document.querySelectorAll('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    setRange(preset(b.dataset.preset));
    load();
  }));
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', render));

readState();
render();
load();
