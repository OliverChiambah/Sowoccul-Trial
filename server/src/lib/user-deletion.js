/**
 * User-deletion workflow (dual control).
 * ────────────────────────────────────────────────────────────────────────────
 * The IT administrator (role 'admin') can REQUEST removal of any user, but the
 * account is only deleted once the General Manager (role 'manager') approves.
 * This module holds the shared rules so the routes stay thin:
 *
 *   • financialFootprint(userId) — what money-related records a user has. A
 *     member with real accounts/transactions/ledger history must NEVER be hard
 *     deleted: that would orphan ledger lines and break the books. Those are
 *     blocked at request time with guidance to close/freeze the account instead.
 *   • performDeletion(target) — the actual removal, run inside a transaction at
 *     APPROVAL time. It clears the child rows that are safe to remove (sessions,
 *     notifications, 2FA, verifications, and — for a footprint-free member —
 *     their empty accounts) and then the user row.
 *
 * Deleting is intentionally conservative: if in any doubt about financial data,
 * it refuses rather than risk the ledger.
 */
import { db } from '../db/index.js';

/**
 * Count the money-related records tied to a user. Returns { accounts,
 * transactions, ledger, loans, total } — total is the sum that decides whether a
 * hard delete is safe.
 */
export async function financialFootprint(userId) {
  const accounts = await db.one('SELECT COUNT(*)::int AS n FROM accounts WHERE user_id = $1', [userId]);
  const tx = await db.one(
    'SELECT COUNT(*)::int AS n FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.user_id = $1',
    [userId]
  );
  const loans = await db.one('SELECT COUNT(*)::int AS n FROM loan_applications WHERE user_id = $1', [userId]);
  // Ledger sub-accounts tied to this member's accounts (per-member liability rows).
  const ledger = await db.one(
    `SELECT COUNT(*)::int AS n FROM ledger_accounts la
       JOIN accounts a ON a.id = la.member_account_id
      WHERE a.user_id = $1`,
    [userId]
  );
  const nAccounts = accounts?.n || 0;
  const nTx = tx?.n || 0;
  const nLoans = loans?.n || 0;
  const nLedger = ledger?.n || 0;
  return {
    accounts: nAccounts,
    transactions: nTx,
    loans: nLoans,
    ledger: nLedger,
    // An account on its own (freshly opened, never used) is fine to remove with
    // the user. What makes a delete unsafe is real history: transactions, loans,
    // or ledger sub-accounts. Those must be preserved.
    total: nTx + nLoans + nLedger,
  };
}

/**
 * Decide whether a user CAN be removed at all, with a human reason if not.
 * Returns { ok: true } or { ok: false, error }.
 */
export async function canDeleteUser(target) {
  if (!target) return { ok: false, error: 'User not found.' };
  const fp = await financialFootprint(target.id);
  if (fp.total > 0) {
    return {
      ok: false,
      error:
        'This member has financial history (transactions, loans, or ledger records) and cannot be deleted, because that would break the books. Freeze or close the account instead.',
    };
  }
  return { ok: true };
}

/**
 * Actually remove a user. Runs at APPROVAL time, inside one transaction. Clears
 * the safe child rows first, then any empty accounts, then the user. Assumes
 * canDeleteUser() already passed — it re-checks the footprint defensively and
 * throws if history appeared in the meantime.
 */
export async function performDeletion(targetId) {
  await db.tx(async (t) => {
    // Defensive re-check inside the transaction.
    const fp = await financialFootprint(targetId);
    if (fp.total > 0) {
      throw new Error('User gained financial history since the request; deletion aborted to protect the books.');
    }
    // Child rows that are always safe to delete with the user.
    await t.run('DELETE FROM recovery_codes WHERE user_id = $1', [targetId]);
    await t.run('DELETE FROM email_verifications WHERE user_id = $1', [targetId]);
    await t.run('DELETE FROM notifications WHERE user_id = $1', [targetId]);
    // Any provisional/empty accounts the member had (no transactions, verified above).
    await t.run('DELETE FROM accounts WHERE user_id = $1', [targetId]);
    // Finally the user.
    await t.run('DELETE FROM users WHERE id = $1', [targetId]);
  });
}
