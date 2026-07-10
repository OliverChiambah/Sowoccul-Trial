/**
 * post-money.js — the ONE place a member account's balance changes.
 *
 * Every money movement (deposit, withdrawal, transfer leg, loan repayment,
 * correction) goes through postToAccount(). It does four things atomically,
 * inside the caller's db.tx transaction:
 *
 *   1. LOCKS the account row (SELECT … FOR UPDATE) so two concurrent movements
 *      on the same account can't read-modify-write over each other.
 *   2. Computes and writes the new balance (the fast cache).
 *   3. Inserts the transactions row (with balance_after) — the member-facing
 *      history, unchanged in shape.
 *   4. Posts the balanced double-entry ledger lines — the auditable books.
 *
 * Because the lock, the cache update, the history row and the ledger post share
 * one transaction, they commit or roll back together: the cache and the ledger
 * can never drift apart, and no update is lost to a race.
 *
 * Callers pass the transaction handle `t` from db.tx so this composes with any
 * surrounding work (e.g. a transfer posts two legs in one tx).
 */

import * as money from './money.js';
import { postMemberMovement } from './ledger.js';

/**
 * Apply a signed delta to one member account, atomically.
 *
 * @param {object} t     db.tx handle
 * @param {object} o
 * @param {number} o.accountId       member account id
 * @param {number} o.delta           +deposit / −withdrawal, whole FCFA
 * @param {string} o.kind            transactions.kind ('deposit'|'withdrawal'|'transfer'|'repayment'|'adjustment'…)
 * @param {string} [o.description]
 * @param {number} [o.counterpartAccountId]  other member account (transfers)
 * @param {number} o.createdBy       acting user id
 * @param {string} [o.ledgerCounter] ledger counter account code (default 'CASH')
 * @param {boolean} [o.allowNegative] permit the balance to go below zero (default false)
 * @returns {Promise<{balance:number, transactionId:number, ledgerEntryId:number}>}
 */
export async function postToAccount(t, {
  accountId, delta, kind, description = null, counterpartAccountId = null,
  createdBy, ledgerCounter = 'CASH', allowNegative = false,
}) {
  // 1. Lock the row for the life of the transaction.
  const acct = await t.one('SELECT id, balance, status FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
  if (!acct) throw new Error('Account not found.');

  const current = money.fromDb(acct.balance);
  const next = money.add(current, delta);       // add() validates range; delta may be negative
  if (!allowNegative && next < 0) {
    const err = new Error('Not enough funds in the account.');
    err.code = 'insufficient_funds';
    throw err;
  }

  // 2. Write the cached balance.
  await t.run('UPDATE accounts SET balance = $1 WHERE id = $2', [next, accountId]);

  // 3. Member-facing history row.
  const txRow = await t.one(
    `INSERT INTO transactions (account_id, amount, balance_after, kind, description, counterpart_account_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [accountId, delta, next, kind, description, counterpartAccountId, createdBy]
  );

  // 4. Auditable double-entry post.
  const ledgerEntryId = await postMemberMovement(t, {
    memberAccountId: accountId,
    delta,
    counterCode: ledgerCounter,
    reference: `txn:${txRow.id}`,
    description: description || kind,
    postedBy: createdBy,
  });

  return { balance: next, transactionId: txRow.id, ledgerEntryId };
}
