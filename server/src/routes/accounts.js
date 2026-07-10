import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { issueStatement } from '../lib/statements.js';
import { ah } from '../lib/async-handler.js';
import { validateBody, v } from '../lib/validate.js';
import * as money from '../lib/money.js';
import { postToAccount } from '../lib/post-money.js';
import { beginIdempotent } from '../lib/idempotency.js';

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

/** GET /api/accounts — the signed-in member's own accounts. */
accountsRouter.get('/', ah(async (req, res) => {
  const accounts = await db.all(
    'SELECT id, account_number, type, balance, currency, status, created_at FROM accounts WHERE user_id = $1 ORDER BY id',
    [req.user.id]
  );
  res.json({ accounts });
}));

/**
 * GET /api/accounts/statement — everything needed to render a full bank
 * statement: the member (with branch), their accounts, and every transaction.
 * The frontend renders/downloads this as a PDF.
 */
accountsRouter.get('/statement', ah(async (req, res) => {
  const member = await db.one('SELECT full_name, email, phone, branch FROM users WHERE id = $1', [req.user.id]);
  const accounts = await db.all('SELECT id, account_number, type, balance, currency FROM accounts WHERE user_id = $1 ORDER BY id', [req.user.id]);
  const ids = accounts.map((a) => a.id);
  let transactions = [];
  if (ids.length) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    transactions = await db.all(`
      SELECT t.id, t.account_id, t.amount, t.balance_after, t.kind, t.description, t.created_at,
             a.account_number, a.type AS account_type
      FROM transactions t JOIN accounts a ON a.id = t.account_id
      WHERE t.account_id IN (${placeholders})
      ORDER BY t.created_at DESC, t.id DESC
    `, ids);
  }

  // Register a verifiable record of exactly these figures and stamp the
  // document with a code + hash anyone can check on the public verify page.
  const periodFrom = transactions.length ? transactions[transactions.length - 1].created_at : null;
  const periodTo = transactions.length ? transactions[0].created_at : null;
  const issued = await issueStatement({
    userId: req.user.id, fullName: member.full_name,
    periodFrom, periodTo, accounts, transactions,
  });

  res.json({
    member, accounts, transactions, headquarters: 'Limbe',
    generated_at: new Date().toISOString(),
    verification: { code: issued.code, hash: issued.content_hash, period_from: periodFrom, period_to: periodTo },
  });
}));

/** GET /api/accounts/:id/transactions — history for one of the member's accounts. */
accountsRouter.get('/:id/transactions', ah(async (req, res) => {
  const account = await db.one('SELECT * FROM accounts WHERE id = $1', [req.params.id]);

  if (!account) return res.status(404).json({ error: 'Account not found.' });
  // Members can only see their own; staff/admin can see any.
  if (account.user_id !== req.user.id && req.user.role === 'member') {
    return res.status(403).json({ error: "You can't view this account." });
  }

  const transactions = await db.all(
    'SELECT id, amount, balance_after, kind, description, created_at FROM transactions WHERE account_id = $1 ORDER BY created_at DESC, id DESC',
    [account.id]
  );

  res.json({ account: { id: account.id, account_number: account.account_number, type: account.type, balance: account.balance, currency: account.currency }, transactions });
}));

/**
 * POST /api/accounts/transfer — move money between the member's OWN accounts.
 * Body: { from_account_id, to_account_id, amount, description }
 * Real, atomic double-entry: debit one, credit the other, in a transaction.
 */
accountsRouter.post('/transfer', validateBody({
  from_account_id: v.int().min(1),
  to_account_id: v.int().min(1),
  amount: v.int().min(1),
  description: v.string().trim().max(200).optional(),
}), ah(async (req, res) => {
  const { from_account_id, to_account_id, description } = req.body;
  const amt = money.fromUser(req.body.amount); // throws MoneyError (userSafe) if bad

  // Idempotency: a retried transfer with the same key returns the first result.
  const idem = await beginIdempotent(req, 'transfer');
  if (idem.replay) return res.json(idem.response);

  if (from_account_id === to_account_id) {
    return res.status(400).json({ error: 'Choose two different accounts.' });
  }

  const from = await db.one('SELECT * FROM accounts WHERE id = $1', [from_account_id]);
  const to = await db.one('SELECT * FROM accounts WHERE id = $1', [to_account_id]);

  if (!from || !to) return res.status(404).json({ error: 'Account not found.' });
  if (from.user_id !== req.user.id || to.user_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only transfer between your own accounts.' });
  }
  if (from.status !== 'active' || to.status !== 'active') {
    return res.status(400).json({ error: 'One of these accounts is not active.' });
  }

  const fromBal = money.fromDb(from.balance);
  const toBal = money.fromDb(to.balance);
  if (fromBal < amt) {
    return res.status(400).json({ error: 'Not enough funds in the source account.' });
  }

  const result = await db.tx(async (t) => {
    const note = (description || 'Internal transfer').slice(0, 200);
    // Two legs, both locked + ledgered, in one transaction. Debit source first
    // (its insufficient-funds check runs under the row lock), then credit dest.
    const out = await postToAccount(t, {
      accountId: from.id, delta: -amt, kind: 'transfer', description: note,
      counterpartAccountId: to.id, createdBy: req.user.id,
    });
    const inn = await postToAccount(t, {
      accountId: to.id, delta: amt, kind: 'transfer', description: note,
      counterpartAccountId: from.id, createdBy: req.user.id,
    });
    return { newFrom: out.balance, newTo: inn.balance };
  });

  req.log?.info('transfer.ok', { from: from.id, to: to.id, amount: amt, user_id: req.user.id });
  const response = { ok: true, ...result };
  await idem.finish(200, response);
  res.json(response);
}));
