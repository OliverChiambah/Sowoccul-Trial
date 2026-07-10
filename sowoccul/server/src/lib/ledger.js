/**
 * Double-entry ledger.
 *
 * Runs ALONGSIDE the stored `accounts.balance` cache. Every money movement posts
 * a balanced journal entry whose lines sum to exactly zero (debits = credits).
 * The ledger is the auditable source of truth; `accounts.balance` is a fast cache
 * that must always equal the ledger. `reconcile()` proves that equality.
 *
 * Sign convention on ledger_lines.amount:  +debit / −credit.
 * Account-type normal balances:
 *   asset, expense       → debit-normal   (balance = Σ debits − Σ credits = Σ amount)
 *   liability, equity, income → credit-normal (balance = −Σ amount)
 *
 * A member's savings is a LIABILITY of the cooperative. Each member account maps
 * to its own liability sub-account so we can reconcile per member account.
 *
 * All functions that write take a transaction handle `t` (from db.tx) so the
 * ledger post is atomic with the balance update it accompanies — they commit or
 * roll back together.
 */

import { db } from '../db/index.js';

// Base chart of accounts created on first use. Per-member liability sub-accounts
// are created on demand (code: MEMBER_DEPOSITS:<accountId>).
const BASE_ACCOUNTS = [
  ['CASH', 'Cash & bank', 'asset'],
  ['MEMBER_DEPOSITS', 'Member deposits (control)', 'liability'],
  ['LOANS_RECEIVABLE', 'Loans receivable', 'asset'],
  ['ADJUSTMENTS', 'Adjustments & corrections', 'equity'],
];

/** Ensure the base chart of accounts exists. Idempotent. */
export async function ensureChart(t = db) {
  for (const [code, name, type] of BASE_ACCOUNTS) {
    await t.run(
      `INSERT INTO ledger_accounts (code, name, type) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING`,
      [code, name, type]
    );
  }
}

/** Look up a base ledger account id by code (chart must be seeded). */
export async function accountId(code, t = db) {
  const row = await t.one('SELECT id FROM ledger_accounts WHERE code = $1', [code]);
  if (!row) throw new Error(`Ledger account ${code} is missing — seed the chart first.`);
  return row.id;
}

/**
 * Get (or create) the per-member liability sub-account for a member account.
 * Returns the ledger_accounts.id.
 */
export async function memberLiabilityAccount(memberAccountId, t = db) {
  const existing = await t.one(
    'SELECT id FROM ledger_accounts WHERE member_account_id = $1', [memberAccountId]
  );
  if (existing) return existing.id;
  const created = await t.one(
    `INSERT INTO ledger_accounts (code, name, type, member_account_id)
     VALUES ($1, $2, 'liability', $3) RETURNING id`,
    [`MEMBER_DEPOSITS:${memberAccountId}`, `Member deposits #${memberAccountId}`, memberAccountId]
  );
  return created.id;
}

/**
 * Post a balanced journal entry. `lines` is an array of
 *   { account: <ledger_account_id>, amount: <+debit / −credit> }
 * The amounts MUST sum to zero. Throws otherwise (a refusal to post an
 * unbalanced entry is the whole point of double-entry).
 */
export async function postEntry(t, { reference, description, postedBy, lines }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('A journal entry needs at least two lines.');
  }
  const sum = lines.reduce((s, l) => s + Number(l.amount), 0);
  if (sum !== 0) {
    throw new Error(`Unbalanced journal entry (lines sum to ${sum}, must be 0).`);
  }
  const entry = await t.one(
    `INSERT INTO ledger_entries (reference, description, posted_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [reference || null, description || null, postedBy || null]
  );
  for (const l of lines) {
    await t.run(
      `INSERT INTO ledger_lines (entry_id, ledger_account_id, amount) VALUES ($1, $2, $3)`,
      [entry.id, l.account, Number(l.amount)]
    );
  }
  return entry.id;
}

/**
 * Convenience: post the ledger side of a member cash movement.
 *   delta > 0  → deposit  : DEBIT Cash, CREDIT the member's liability
 *   delta < 0  → withdraw : CREDIT Cash, DEBIT the member's liability
 * `counterCode` lets a caller use a different asset/equity account than CASH
 * (e.g. 'ADJUSTMENTS' for a correction, 'LOANS_RECEIVABLE' for a repayment).
 */
export async function postMemberMovement(t, { memberAccountId, delta, counterCode = 'CASH', reference, description, postedBy }) {
  if (delta === 0) return null;                 // nothing to post
  const liability = await memberLiabilityAccount(memberAccountId, t);
  const counter = await accountId(counterCode, t);
  // liability is credit-normal: increasing it (deposit) is a CREDIT (−).
  // counter (CASH) is debit-normal: a deposit increases cash → DEBIT (+).
  const lines = [
    { account: counter, amount: delta },        // +delta debit on deposit, −delta credit on withdrawal
    { account: liability, amount: -delta },      // opposite side, keeps sum 0
  ];
  return postEntry(t, { reference, description, postedBy, lines });
}

/**
 * One-time backfill: for any member account that has a balance but no ledger
 * history yet, post an opening-balance journal entry so the ledger starts in
 * sync with the existing cached balances. Idempotent — it only touches accounts
 * that have no member ledger lines yet, so running it twice is safe and a no-op
 * the second time. Balances against the ADJUSTMENTS (equity) account, which is
 * the correct place for opening equity.
 */
export async function backfillOpeningBalances(postedBy = null) {
  const accounts = await db.all(`
    SELECT a.id, a.balance::bigint AS balance
    FROM accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM ledger_accounts la
      JOIN ledger_lines ll ON ll.ledger_account_id = la.id
      WHERE la.member_account_id = a.id
    )
  `);
  let posted = 0;
  for (const a of accounts) {
    const bal = Number(a.balance);
    if (bal === 0) continue;              // nothing to open
    await db.tx(async (t) => {
      await postMemberMovement(t, {
        memberAccountId: a.id, delta: bal, counterCode: 'ADJUSTMENTS',
        reference: `opening:${a.id}`, description: 'Opening balance', postedBy,
      });
    });
    posted++;
  }
  return { posted, scanned: accounts.length };
}
export async function ledgerAccountBalance(ledgerAccountId, t = db) {
  const row = await t.one(
    'SELECT COALESCE(SUM(amount),0)::bigint AS bal FROM ledger_lines WHERE ledger_account_id = $1',
    [ledgerAccountId]
  );
  return Number(row ? row.bal : 0);
}

/**
 * Reconcile the ledger against the stored account balances. For every member
 * account, the member's liability sub-account (credit-normal, so balance =
 * −Σ amount) must equal accounts.balance. Returns { ok, checked, mismatches[] }.
 * This is the proof the books agree with the cache.
 */
export async function reconcile(t = db) {
  const rows = await t.all(`
    SELECT a.id AS account_id, a.balance::bigint AS balance,
           COALESCE((SELECT -SUM(ll.amount)
                     FROM ledger_lines ll
                     JOIN ledger_accounts la ON la.id = ll.ledger_account_id
                     WHERE la.member_account_id = a.id), 0)::bigint AS ledger_balance
    FROM accounts a
  `);
  const mismatches = [];
  for (const r of rows) {
    if (Number(r.balance) !== Number(r.ledger_balance)) {
      mismatches.push({ account_id: r.account_id, balance: Number(r.balance), ledger_balance: Number(r.ledger_balance) });
    }
  }
  return { ok: mismatches.length === 0, checked: rows.length, mismatches };
}

/**
 * Global trial balance: every journal entry sums to zero, so the sum of ALL
 * ledger lines must be exactly zero. A non-zero result means a corrupt or
 * partial entry got in. Returns { ok, total }.
 */
export async function trialBalance(t = db) {
  const row = await t.one('SELECT COALESCE(SUM(amount),0)::bigint AS total FROM ledger_lines');
  const total = Number(row ? row.total : 0);
  return { ok: total === 0, total };
}
