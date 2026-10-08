// Employee section: field definitions shared by the list/detail pages and the save logic.

// Editable fields, grouped into form sections. Types drive both the form control and validation.
export const SECTIONS = [
  {
    title: 'Name',
    fields: [
      { name: 'strTitle', label: 'Title', type: 'text' },
      { name: 'strFirstName', label: 'First name', type: 'text' },
      { name: 'strMiddleName', label: 'Middle name', type: 'text' },
      { name: 'strLastName', label: 'Last name', type: 'text' },
    ],
  },
  {
    title: 'Address',
    fields: [
      { name: 'strAddress', label: 'Address', type: 'textarea', wide: true },
      { name: 'strCity', label: 'City', type: 'text' },
      { name: 'strState', label: 'State', type: 'text' },
      { name: 'strZip', label: 'ZIP', type: 'text' },
      { name: 'strCounty', label: 'County', type: 'text' },
      { name: 'strCountry', label: 'Country', type: 'text' },
    ],
  },
  {
    title: 'Employment',
    fields: [
      { name: 'strDepartment', label: 'Department', type: 'text' },
      { name: 'strDepartmentID', label: 'Department ID', type: 'text' },
      { name: 'dtmDateHired', label: 'Date hired', type: 'date' },
      { name: 'dtmTerminated', label: 'Date terminated', type: 'date' },
      { name: 'dtmBirthDate', label: 'Birth date', type: 'date' },
      { name: 'strDegree', label: 'Degree', type: 'text' },
      { name: 'strPayGroup', label: 'Pay group', type: 'text' },
      { name: 'decCommissionPercent', label: 'Commission %', type: 'number' },
      { name: 'ysnSalesman', label: 'Salesman', type: 'bool' },
      { name: 'ysnFulfillment', label: 'Fulfillment', type: 'bool' },
    ],
  },
  {
    title: 'Contact & systems',
    fields: [
      { name: 'strSendToEmail', label: 'Email', type: 'email' },
      { name: 'ysnEmail', label: 'Send email', type: 'bool' },
      { name: 'strEmergencyContact', label: 'Emergency contact', type: 'text' },
      { name: 'strEmergencyPhone', label: 'Emergency phone', type: 'text' },
      { name: 'strClockId', label: 'Clock ID', type: 'text' },
      { name: 'strClockCard', label: 'Clock card', type: 'text' },
      { name: 'strADUserName', label: 'AD user name', type: 'text' },
      { name: 'strExpenseID', label: 'Expense ID', type: 'text' },
    ],
  },
  {
    title: 'Notes',
    fields: [
      { name: 'strNotes', label: 'Notes', type: 'textarea', wide: true },
      { name: 'memNotes', label: 'Memo', type: 'textarea', wide: true },
    ],
  },
];

const FIELDS = new Map(SECTIONS.flatMap((s) => s.fields).map((f) => [f.name, f]));

// Every property UpdateEmployeeDataRequest accepts (per Swagger). Anything else in a record is dropped.
const UPDATE_KEYS = [
  ...FIELDS.keys(),
  'dtmDateEntered', 'dtmLastModified', 'strEditLock',
];

const ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;
export const isEmployeeId = (id) => ID_RE.test(id ?? '');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates and normalises one edited value; throws a RangeError with a user-facing message. */
function coerce(field, value) {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'bool':
      if (typeof value !== 'boolean') throw new RangeError(`${field.label} must be true or false`);
      return value;
    case 'number': {
      if (value === '') return null;
      const n = Number(value);
      if (!Number.isFinite(n)) throw new RangeError(`${field.label} must be a number`);
      return n;
    }
    case 'date': {
      if (value === '') return null;
      if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) throw new RangeError(`${field.label} must be a valid date`);
      return `${value}T00:00:00`;
    }
    default: {
      if (typeof value !== 'string') throw new RangeError(`${field.label} must be text`);
      const v = value.trim();
      return v === '' ? null : v;
    }
  }
}

/**
 * Builds the full PUT body: the current record with only the editable fields
 * from `changes` applied. Sending the whole record (with excludeNullValues=false)
 * means cleared fields really are cleared, and fields the form doesn't show are kept.
 */
export function buildUpdate(current, changes) {
  const body = {};
  for (const key of UPDATE_KEYS) body[key] = current[key] ?? null;
  for (const [key, value] of Object.entries(changes ?? {})) {
    const field = FIELDS.get(key);
    if (!field) throw new RangeError(`${key} can't be edited`);
    body[key] = coerce(field, value);
  }
  if (!body.strFirstName) throw new RangeError('First name is required');
  body.requestIgnoreNoFirstName = false;
  body.requestRemoveLock = false;
  return body;
}
