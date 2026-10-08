const form = document.getElementById('search');
const statusEl = document.getElementById('status');
const tbody = document.querySelector('#list tbody');
const prev = document.getElementById('prev');
const next = document.getElementById('next');
const pageInfo = document.getElementById('page-info');

const PAGE_SIZE = 25;
const params = new URLSearchParams(location.search);
let page = Math.max(1, Number(params.get('page')) || 1);
form.elements.search.value = params.get('search') ?? '';

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

const fullName = (e) => [e.strFirstName, e.strMiddleName, e.strLastName].filter(Boolean).join(' ');

async function load() {
  const search = form.elements.search.value.trim();
  const q = new URLSearchParams({ page, size: PAGE_SIZE });
  if (search) q.set('search', search);
  history.replaceState(null, '', `?${new URLSearchParams({ ...(search && { search }), ...(page > 1 && { page }) })}`);

  statusEl.className = '';
  statusEl.textContent = 'Loading…';
  try {
    const res = await fetch(`/api/employees?${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.detail?.detail ? `: ${data.detail.detail}` : ''));

    tbody.replaceChildren();
    for (const e of data.items ?? []) {
      const tr = tbody.insertRow();
      tr.append(
        cell(e.strEmployeeID),
        cell(fullName(e)),
        cell(e.strDepartment),
        cell(e.strSendToEmail),
        cell(e.ysnSalesman ? 'Yes' : 'No'),
        cell(e.dtmTerminated ? 'Terminated' : 'Active'),
      );
      const actions = document.createElement('td');
      const link = document.createElement('a');
      link.href = `employee.html?id=${encodeURIComponent(e.strEmployeeID)}`;
      link.textContent = 'Edit';
      link.setAttribute('aria-label', `Edit ${fullName(e) || e.strEmployeeID}`);
      actions.append(link);
      actions.className = 'actions';
      tr.append(actions);
    }

    const count = data.items?.length ?? 0;
    statusEl.textContent = count ? '' : search ? `No employees match “${search}”.` : 'No employees found.';
    pageInfo.textContent = data.totalPages ? `Page ${data.pageNumber} of ${data.totalPages}` : '';
    prev.disabled = page <= 1;
    next.disabled = !data.hasNextPage;
  } catch (err) {
    tbody.replaceChildren();
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  page = 1;
  load();
});
prev.addEventListener('click', () => { page -= 1; load(); });
next.addEventListener('click', () => { page += 1; load(); });

load();
