import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleForTitle, isAlwaysEditor, titleLabel, TITLE_KEYS } from '../src/lib/titles.js';

test('general_manager maps to manager role', () => {
  assert.equal(roleForTitle('general_manager'), 'manager');
});

test('all other known titles map to staff', () => {
  for (const key of ['branch_manager', 'loans_officer', 'cashier', 'intern']) {
    assert.equal(roleForTitle(key), 'staff');
  }
});

test('unknown title defaults to staff', () => {
  assert.equal(roleForTitle('nonsense'), 'staff');
  assert.equal(roleForTitle(undefined), 'staff');
});

test('only branch_manager is an always-editor', () => {
  assert.equal(isAlwaysEditor('branch_manager'), true);
  assert.equal(isAlwaysEditor('cashier'), false);
  assert.equal(isAlwaysEditor('general_manager'), false);
});

test('titleLabel returns human labels and falls back gracefully', () => {
  assert.equal(titleLabel('cashier'), 'Cashier');
  assert.equal(titleLabel('unknown_key'), 'unknown_key');
  assert.equal(titleLabel(''), '');
});

test('TITLE_KEYS covers the five roles', () => {
  assert.equal(TITLE_KEYS.length, 5);
  assert.ok(TITLE_KEYS.includes('general_manager'));
});
