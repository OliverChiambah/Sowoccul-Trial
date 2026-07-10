/**
 * Pure, dependency-free authorization logic for member/branch access.
 *
 * Kept separate from middleware/auth.js (which pulls in JWT and DB) so this
 * core policy can be unit-tested in isolation and reasoned about on its own.
 *
 * Governance rule encoded here: the system administrator ('admin') is a
 * TECHNICAL role only. It is deliberately excluded from member financial data —
 * it can neither edit (post money) nor view member accounts/transactions.
 * Operational authority sits with the General Manager ('manager', all branches)
 * and branch staff (own branch, edit needs can_edit).
 */

export function canViewBranch(user, branchName) {
  if (!user) return false;
  if (user.role === 'manager') return true;
  if (user.role === 'staff') return user.branch === branchName;
  return false;
}

export function canEditBranch(user, branchName) {
  if (!user) return false;
  if (user.role === 'manager') return true;
  if (user.role === 'staff') return user.branch === branchName && !!user.can_edit;
  return false;
}
