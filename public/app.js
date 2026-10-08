const form = document.getElementById('query');
const select = form.elements.path;
const propsLabel = document.getElementById('props-label');
const statusEl = document.getElementById('status');
const table = document.getElementById('results');
let endpoints = [];

function rowsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return data ? [data] : [];
}

function cell(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

function render(rows) {
  table.replaceChildren();
  if (!rows.length) return;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))];
  const head = table.createTHead().insertRow();
  cols.forEach((c) => head.appendChild(cell('th', c)));
  const body = table.createTBody();
  for (const r of rows) {
    const tr = body.insertRow();
    for (const c of cols) {
      const v = r?.[c];
      tr.appendChild(cell('td', v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)));
    }
  }
}

function current() {
  return endpoints.find((e) => e.path === select.value);
}

select.addEventListener('change', () => {
  propsLabel.hidden = !current()?.query.includes('properties');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(form);
  const ep = current();
  const page = Math.max(1, Number(f.get('page')) || 1);
  const rows = Math.max(1, Number(f.get('rows')) || 25);
  const params = new URLSearchParams({ path: ep.path });
  if (ep.paging === 'skipTake') params.set('skip', (page - 1) * rows), params.set('take', rows);
  if (ep.paging === 'page') params.set('pageNumber', page), params.set('size', rows);
  if (f.get('filter')) params.set('filter', f.get('filter'));
  if (!propsLabel.hidden && f.get('properties')) params.set('properties', f.get('properties'));

  statusEl.textContent = 'Loading…';
  try {
    const res = await fetch(`/api/list?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.detail ? `: ${JSON.stringify(data.detail)}` : ''));
    const list = rowsOf(data);
    render(list);
    const pages = data?.totalPages ? ` · page ${data.pageNumber} of ${data.totalPages}` : '';
    statusEl.textContent = `${list.length} row(s)${pages}`;
  } catch (err) {
    table.replaceChildren();
    statusEl.textContent = err.message;
  }
});

(async () => {
  endpoints = await (await fetch('/api/endpoints')).json();
  for (const ep of endpoints) {
    const opt = new Option(ep.path, ep.path);
    select.add(opt);
  }
  select.value = endpoints.find((e) => e.path.startsWith('Customer/'))?.path ?? endpoints[0]?.path;
  select.dispatchEvent(new Event('change'));
})();
