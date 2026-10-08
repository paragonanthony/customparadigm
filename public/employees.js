const form = document.getElementById('search');
const statusEl = document.getElementById('status');
const tbody = document.querySelector('#list tbody');
const headers = [...document.querySelectorAll('#list th[aria-sort]')];
const prev = document.getElementById('prev');
const next = document.getElementById('next');
const pageInfo = document.getElementById('page-info');

const PAGE_SIZE = 25;
const fullName = (e) => [e.strFirstName, e.strMiddleName, e.strLastName].filter(Boolean).join(' ');
const isActive = (e) => !e.dtmTerminated;

// Sortable columns: the value each one sorts by.
const COLUMNS = {
  id: (e) => e.strEmployeeID ?? '',
  name: (e) => fullName(e),
  department: (e) => e.strDepartment ?? '',
  email: (e) => e.strSendToEmail ?? '',
  salesman: (e) => (e.ysnSalesman ? 'Yes' : 'No'),
  status: (e) => (isActive(e) ? 'Active' : 'Terminated'),
};
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// View state lives in the URL so a filtered/sorted list can be bookmarked or returned to.
const params = new URLSearchParams(location.search);
const state = {
  search: params.get('search') ?? '',
  all: params.get('all') === '1',
  sort: COLUMNS[params.get('sort')] ? params.get('sort') : 'name',
  dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  page: Math.max(1, Number(params.get('page')) || 1),
};
form.elements.search.value = state.search;
form.elements.all.checked = state.all;

let employees = [];

function saveState() {
  const q = new URLSearchParams();
  if (state.search) q.set('search', state.search);
  if (state.all) q.set('all', '1');
  if (state.sort !== 'name' || state.dir !== 'asc') q.set('sort', state.sort), q.set('dir', state.dir);
  if (state.page > 1) q.set('page', state.page);
  history.replaceState(null, '', q.size ? `?${q}` : location.pathname);
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function visibleRows() {
  const term = state.search.trim().toLowerCase();
  const key = COLUMNS[state.sort];
  const sign = state.dir === 'asc' ? 1 : -1;
  return employees
    .filter((e) => state.all || isActive(e))
    .filter((e) => !term || [e.strEmployeeID, fullName(e), e.strDepartment, e.strSendToEmail]
      .some((v) => v?.toLowerCase().includes(term)))
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      // Blank values always sort last, whichever direction.
      if (!ka !== !kb) return ka ? -1 : 1;
      return sign * collator.compare(ka, kb) || collator.compare(COLUMNS.id(a), COLUMNS.id(b));
    });
}

function render() {
  const rows = visibleRows();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  saveState();

  for (const th of headers) {
    const col = th.querySelector('button').dataset.sort;
    th.setAttribute('aria-sort', col === state.sort ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  }

  tbody.replaceChildren();
  for (const e of rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE)) {
    const tr = tbody.insertRow();
    if (!isActive(e)) tr.className = 'inactive';
    tr.append(
      cell(e.strEmployeeID),
      cell(fullName(e)),
      cell(e.strDepartment),
      cell(e.strSendToEmail),
      cell(COLUMNS.salesman(e)),
      cell(COLUMNS.status(e)),
    );
    const actions = document.createElement('td');
    actions.className = 'actions';
    const link = document.createElement('a');
    link.href = `employee.html?id=${encodeURIComponent(e.strEmployeeID)}`;
    link.textContent = 'Edit';
    link.setAttribute('aria-label', `Edit ${fullName(e) || e.strEmployeeID}`);
    actions.append(link);
    tr.append(actions);
  }

  const activeCount = employees.filter(isActive).length;
  const scope = state.all ? `${employees.length} employees` : `${activeCount} active of ${employees.length} employees`;
  statusEl.className = '';
  statusEl.textContent = rows.length
    ? (state.search ? `${rows.length} match${rows.length === 1 ? '' : 'es'} · ${scope}` : scope)
    : state.search ? `No ${state.all ? '' : 'active '}employees match “${state.search}”.` : `No ${state.all ? '' : 'active '}employees.`;
  pageInfo.textContent = pages > 1 ? `Page ${state.page} of ${pages}` : '';
  prev.hidden = next.hidden = pages <= 1;
  prev.disabled = state.page <= 1;
  next.disabled = state.page >= pages;
}

for (const th of headers) {
  th.querySelector('button').addEventListener('click', (e) => {
    const col = e.currentTarget.dataset.sort;
    state.dir = state.sort === col && state.dir === 'asc' ? 'desc' : 'asc';
    state.sort = col;
    state.page = 1;
    render();
  });
}
form.addEventListener('submit', (e) => e.preventDefault());
form.elements.search.addEventListener('input', () => {
  state.search = form.elements.search.value;
  state.page = 1;
  render();
});
form.elements.all.addEventListener('change', () => {
  state.all = form.elements.all.checked;
  state.page = 1;
  render();
});
prev.addEventListener('click', () => { state.page -= 1; render(); });
next.addEventListener('click', () => { state.page += 1; render(); });

(async () => {
  statusEl.textContent = 'Loading…';
  try {
    const res = await fetch('/api/employees');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.detail?.detail ? `: ${data.detail.detail}` : ''));
    employees = data.items ?? [];
    render();
    if (data.truncated) statusEl.textContent += ` (only the first ${employees.length} were loaded)`;
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
})();
