import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareUserImport } from '../user-import.mjs';

const schools = [{ udise: '123', name: 'School', mandal: 'BHAMINI' }];
const defaults = { role: 'PET', schoolUdise: '123' };
const parse = (rows, opts = defaults, emails = []) => prepareUserImport(rows, opts, schools, emails);

test('two-column sheet inherits assignment and preserves text passwords', () => {
  const result = parse([['Email', 'Password'], [' STAFF@example.org ', ' 0012345678 ']]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.users[0], { row: 2, email: 'staff@example.org', password: ' 0012345678 ', displayName: 'staff', role: 'PET', mandal: 'BHAMINI', schoolUdise: '123' });
});
test('optional columns override defaults and MEO gets all schools', () => {
  const result = parse([['email', 'password', 'full name', 'role', 'mandal'], ['meo@example.org', 'Secret123', 'MEO Name', 'meo', 'BHAMINI']]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.users[0].schoolUdise, 'ALL');
  assert.equal(result.users[0].displayName, 'MEO Name');
});
test('rejects duplicate and registered emails without leaking passwords', () => {
  const result = parse([['email', 'password'], ['a@example.org', 'Secret123'], ['A@example.org', 'Secret123']], defaults, ['a@example.org']);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[1], /Row 3:.*duplicate email/);
  assert.ok(result.errors.every(error => !error.includes('Secret123')));
});
test('validates roles and school ownership before any creation', () => {
  const result = parse([['email', 'password', 'role', 'mandal'], ['a@example.org', 'Secret123', 'DEO', 'BHAMINI'], ['b@example.org', 'Secret123', 'PD', 'KOMARADA']]);
  assert.match(result.errors[0], /role must be/);
  assert.match(result.errors[1], /school must belong/);
});
test('rejects numeric password cells and preserves actual row numbers across blanks', () => {
  const result = parse([['email', 'password'], ['', ''], ['a@example.org', 12345678]]);
  assert.match(result.errors[0], /Row 3:.*Text/);
});
test('rejects missing and duplicate headings and oversized imports', () => {
  assert.throws(() => parse([['email'], ['a@example.org']]), /Required columns/);
  assert.throws(() => parse([['email', 'Email', 'password'], ['a', 'b', 'Secret123']]), /Duplicate column/);
  assert.throws(() => parse([['email', 'password'], ...Array.from({length:201}, (_, i) => [`a${i}@example.org`, 'Secret123'])]), /200/);
});
