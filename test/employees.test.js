import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdate, isEmployeeId } from '../src/employees.js';

const current = {
  strEmployeeID: 'ABDRAH001', intEmployeeID: 46,
  strFirstName: 'Rahmatillo', strLastName: 'Abduqodirov', strCity: 'Denver',
  dtmDateEntered: '2025-10-06T00:00:00-06:00', dtmLastModified: '2025-10-06T09:16:00.14-06:00',
  strEditLock: 'LOCK', ysnSalesman: true, decCommissionPercent: null,
};

test('buildUpdate keeps unedited fields and applies changes', () => {
  const body = buildUpdate(current, { strCity: ' Boulder ', ysnSalesman: false, decCommissionPercent: '2.5', dtmDateHired: '2024-03-01' });
  assert.equal(body.strCity, 'Boulder');
  assert.equal(body.ysnSalesman, false);
  assert.equal(body.decCommissionPercent, 2.5);
  assert.equal(body.dtmDateHired, '2024-03-01T00:00:00');
  assert.equal(body.strLastName, 'Abduqodirov');
  assert.equal(body.strEditLock, 'LOCK');
  assert.equal(body.dtmDateEntered, current.dtmDateEntered);
  assert.equal(body.requestRemoveLock, false);
  // Read-only identifiers are never sent.
  assert.equal('strEmployeeID' in body, false);
  assert.equal('intEmployeeID' in body, false);
});

test('buildUpdate turns blank values into null so fields can be cleared', () => {
  const body = buildUpdate(current, { strCity: '  ', dtmDateHired: '', decCommissionPercent: '' });
  assert.equal(body.strCity, null);
  assert.equal(body.dtmDateHired, null);
  assert.equal(body.decCommissionPercent, null);
});

test('buildUpdate rejects unknown fields, bad values and a blank first name', () => {
  assert.throws(() => buildUpdate(current, { strEmployeeID: 'X' }), /can't be edited/);
  assert.throws(() => buildUpdate(current, { decCommissionPercent: 'abc' }), /must be a number/);
  assert.throws(() => buildUpdate(current, { dtmBirthDate: '03/01/2024' }), /valid date/);
  assert.throws(() => buildUpdate(current, { ysnSalesman: 'yes' }), /true or false/);
  assert.throws(() => buildUpdate(current, { strFirstName: ' ' }), /First name is required/);
});

test('isEmployeeId accepts Paradigm IDs and rejects path tricks', () => {
  assert.ok(isEmployeeId('ABDRAH001'));
  assert.ok(isEmployeeId('CHARLOTTE'));
  for (const bad of ['', '../Report', 'a/b', 'x y', undefined]) assert.equal(isEmployeeId(bad), false, String(bad));
});
