/**
 * Maker-checker authorization — pure logic, no dependencies.
 * ────────────────────────────────────────────────────────────────────────────
 * Decides whether a given user may approve/reject a given pending entry. Kept
 * in its own module (a) so it has no framework dependencies and can be unit
 * tested directly, and (b) because it encodes a security rule that must be easy
 * to read and hard to get wrong.
 *
 * The rules:
 *   • The approver must NOT be the person who requested it (maker ≠ checker).
 *   • admin and General Manager (role 'manager') may approve any branch.
 *   • A Branch Manager (role 'staff', title 'branch_manager') may approve only
 *     entries from their OWN branch.
 *   • Everyone else may not approve.
 */
export function canApprovePending(user, pending) {
  if (!user || !pending) return false;
  if (user.id === pending.requested_by) return false;          // maker ≠ checker
  // Top-level approval sits with the General Manager (all branches). The IT
  // administrator is not a financial approver and is excluded on purpose.
  if (user.role === 'manager') return true;
  if (user.role === 'staff' && user.title === 'branch_manager') {
    return Boolean(user.branch && pending.branch && user.branch === pending.branch);
  }
  return false;
}
