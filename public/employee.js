const id = new URLSearchParams(location.search).get('id');
const form = document.getElementById('edit');
const sectionsEl = document.getElementById('sections');
const statusEl = document.getElementById('status');
const titleEl = document.getElementById('title');
const metaEl = document.getElementById('meta');
const saveBtn = document.getElementById('save');
const resetBtn = document.getElementById('reset');
const dirtyEl = document.getElementById('dirty');

let fields = [];      // flat list of field definitions
let record = null;    // last record loaded from / saved to Paradigm

function setStatus(text, kind = '') {
  statusEl.className = kind;
  statusEl.textContent = text;
}

function el(tag, props = {}, text) {
  const e = Object.assign(document.createElement(tag), props);
  if (text !== undefined) e.textContent = text;
  return e;
}

const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString() : '—');
const fullName = (e) => [e.strFirstName, e.strMiddleName, e.strLastName].filter(Boolean).join(' ');

// Value shown in the form for a field, as the control expects it.
function toControl(f, v) {
  if (f.type === 'bool') return Boolean(v);
  if (f.type === 'date') return dateOnly(v);
  if (v === null || v === undefined) return '';
  return String(v);
}

function readControl(f) {
  const input = form.elements[f.name];
  return f.type === 'bool' ? input.checked : input.value;
}

function buildForm(sections) {
  sectionsEl.replaceChildren();
  for (const section of sections) {
    const fs = el('fieldset');
    fs.append(el('legend', {}, section.title));
    const grid = el('div', { className: 'grid' });
    for (const f of section.fields) {
      const wrap = el('label', { className: `field${f.wide ? ' wide' : ''}${f.type === 'bool' ? ' check' : ''}` });
      let input;
      if (f.type === 'textarea') input = el('textarea', { name: f.name, rows: 3 });
      else if (f.type === 'bool') input = el('input', { type: 'checkbox', name: f.name });
      else if (f.type === 'number') input = el('input', { type: 'number', name: f.name, step: 'any' });
      else input = el('input', { type: f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : 'text', name: f.name });
      if (f.name === 'strFirstName') input.required = true;
      if (f.type === 'bool') wrap.append(input, el('span', {}, f.label));
      else wrap.append(el('span', {}, f.label + (input.required ? ' *' : '')), input);
      grid.append(wrap);
    }
    fs.append(grid);
    sectionsEl.append(fs);
  }
}

function fill(rec) {
  record = rec;
  for (const f of fields) {
    const input = form.elements[f.name];
    const v = toControl(f, rec[f.name]);
    if (f.type === 'bool') input.checked = v;
    else input.value = v;
  }
  titleEl.textContent = fullName(rec) || rec.strEmployeeID;
  document.title = `${titleEl.textContent} · Employees`;
  metaEl.replaceChildren(
    el('dt', {}, 'Employee ID'), el('dd', {}, rec.strEmployeeID),
    el('dt', {}, 'Entered'), el('dd', {}, fmtDateTime(rec.dtmDateEntered)),
    el('dt', {}, 'Last modified'), el('dd', {}, fmtDateTime(rec.dtmLastModified)),
  );
  updateDirty();
}

// Only fields whose value differs from the loaded record are sent.
function changes() {
  const out = {};
  for (const f of fields) {
    const now = readControl(f);
    const was = toControl(f, record[f.name]);
    if (f.type === 'bool' ? now !== was : now.trim() !== was.trim()) out[f.name] = now;
  }
  return out;
}

function updateDirty() {
  const n = Object.keys(changes()).length;
  saveBtn.disabled = n === 0;
  resetBtn.disabled = n === 0;
  dirtyEl.textContent = n ? `${n} unsaved change${n === 1 ? '' : 's'}` : '';
}

form.addEventListener('input', updateDirty);
form.addEventListener('change', updateDirty);
resetBtn.addEventListener('click', () => { fill(record); setStatus(''); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const body = { changes: changes(), lastModified: record.dtmLastModified };
  if (!Object.keys(body.changes).length) return;
  saveBtn.disabled = true;
  setStatus('Saving…');
  try {
    const res = await fetch(`/api/employees/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.detail?.detail ? `: ${data.detail.detail}` : ''));
    fill(data);
    setStatus('Saved.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
    updateDirty();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (record && Object.keys(changes()).length) e.preventDefault();
});

(async () => {
  if (!id) {
    titleEl.textContent = 'No employee selected';
    return;
  }
  try {
    const [sectionsRes, recRes] = await Promise.all([
      fetch('/api/employees/fields'),
      fetch(`/api/employees/${encodeURIComponent(id)}`),
    ]);
    const sections = await sectionsRes.json();
    const rec = await recRes.json();
    if (!recRes.ok) {
      throw new Error(recRes.status === 404 ? `Employee “${id}” was not found.` : rec.error);
    }
    fields = sections.flatMap((s) => s.fields);
    buildForm(sections);
    fill(rec);
    form.hidden = false;
  } catch (err) {
    titleEl.textContent = 'Employee';
    setStatus(err.message, 'error');
  }
})();
