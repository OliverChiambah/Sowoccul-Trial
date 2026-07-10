import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canApprovePending } from '../src/lib/maker-checker.js';

const entry = (over = {}) => ({ requested_by: 2, branch: 'Limbe', ...over });

test('the maker cannot check their own entry, whatever their role', () => {
  assert.equal(canApprovePending({ id: 2, role: 'admin' }, entry()), false);
  assert.equal(canApprovePending({ id: 2, role: 'manager' }, entry()), false);
  assert.equal(canApprovePending({ id: 2, role: 'staff', title: 'branch_manager', branch: 'Limbe' }, entry()), false);
});

test('the IT admin can NOT approve — technical role, separated from money', () => {
  // System admin is deliberately excluded from financial approval.
  assert.equal(canApprovePending({ id: 9, role: 'admin' }, entry({ branch: 'Douala' })), false);
  assert.equal(canApprovePending({ id: 9, role: 'admin' }, entry({ branch: 'Limbe' })), false);
});

test('general manager can approve any branch (when not the maker)', () => {
  assert.equal(canApprovePending({ id: 9, role: 'manager', branch: null }, entry({ branch: 'Bamenda' })), true);
});

test('branch manager can approve only their own branch', () => {
  const bm = { id: 8, role: 'staff', title: 'branch_manager', branch: 'Limbe' };
  assert.equal(canApprovePending(bm, entry({ branch: 'Limbe' })), true);
  assert.equal(canApprovePending(bm, entry({ branch: 'Douala' })), false);
});

test('a cashier or intern can never approve', () => {
  assert.equal(canApprovePending({ id: 8, role: 'staff', title: 'cashier', branch: 'Limbe' }, entry()), false);
  assert.equal(canApprovePending({ id: 8, role: 'staff', title: 'intern', branch: 'Limbe' }, entry()), false);
});

test('a member can never approve', () => {
  assert.equal(canApprovePending({ id: 8, role: 'member' }, entry()), false);
});

test('missing data is safe (denies)', () => {
  assert.equal(canApprovePending(null, entry()), false);
  assert.equal(canApprovePending({ id: 8, role: 'admin' }, null), false);
  // branch manager with no branch set can't match
  assert.equal(canApprovePending({ id: 8, role: 'staff', title: 'branch_manager', branch: null }, entry()), false);
});
