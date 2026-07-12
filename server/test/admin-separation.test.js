import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditBranch, canViewBranch } from '../src/lib/permissions.js';

// The system administrator is a technical role only. These tests lock in that
// the IT admin is separated from member money: they cannot edit or even view
// member financial data by branch. Operational roles are unaffected.

test('IT admin can NOT edit any branch (no money posting)', () => {
  assert.equal(canEditBranch({ role: 'admin' }, 'Limbe'), false);
  assert.equal(canEditBranch({ role: 'admin' }, 'Douala'), false);
});

test('IT admin can NOT view member financial data by branch', () => {
  assert.equal(canViewBranch({ role: 'admin' }, 'Limbe'), false);
  assert.equal(canViewBranch({ role: 'admin' }, 'Douala'), false);
});

test('General Manager still edits and views every branch', () => {
  assert.equal(canEditBranch({ role: 'manager' }, 'Limbe'), true);
  assert.equal(canEditBranch({ role: 'manager' }, 'Bamenda'), true);
  assert.equal(canViewBranch({ role: 'manager' }, 'Garoua'), true);
});

test('branch staff edit only their own branch and only with edit rights', () => {
  const editor = { role: 'staff', branch: 'Limbe', can_edit: true };
  const viewer = { role: 'staff', branch: 'Limbe', can_edit: false };
  assert.equal(canEditBranch(editor, 'Limbe'), true);
  assert.equal(canEditBranch(editor, 'Douala'), false);
  assert.equal(canEditBranch(viewer, 'Limbe'), false);
  // but view-only staff can still VIEW their branch
  assert.equal(canViewBranch(viewer, 'Limbe'), true);
  assert.equal(canViewBranch(viewer, 'Douala'), false);
});

test('a member has no branch edit/view authority', () => {
  assert.equal(canEditBranch({ role: 'member', branch: 'Limbe' }, 'Limbe'), false);
  assert.equal(canViewBranch({ role: 'member', branch: 'Limbe' }, 'Limbe'), false);
});
