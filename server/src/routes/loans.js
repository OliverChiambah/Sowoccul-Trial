import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, blockPendingMember } from '../middleware/auth.js';
import { ah } from '../lib/async-handler.js';
import * as money from '../lib/money.js';
import { postToAccount } from '../lib/post-money.js';
import { beginIdempotent } from '../lib/idempotency.js';

export const loansRouter = Router();
loansRouter.use(requireAuth);

function makeReference() {
  const year = new Date().getFullYear();
  const n = Math.floor(100000 + Math.random() * 900000);
  return `SWC-${year}-${n}`;
}

/**
 * POST /api/loans — submit a loan application.
 * Body: the full form payload from the multi-step form.
 * We store the whole payload as JSON and pull out amount/purpose for listing.
 */
loansRouter.post('/', blockPendingMember, ah(async (req, res) => {
  const payload = req.body || {};

  // loan_amount_figures may arrive as "1 500 000" or "1500000".
  const rawAmount = String(payload.loan_amount_figures ?? '').replace(/[^\d]/g, '');
  const amount = rawAmount ? parseInt(rawAmount, 10) : 0;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Enter the loan amount you are requesting.' });
  }
  if (!payload.loan_purpose || !String(payload.loan_purpose).trim()) {
    return res.status(400).json({ error: 'Describe the purpose of the loan.' });
  }

  let reference = makeReference();
  // Extremely unlikely collision guard.
  while (await db.one('SELECT 1 FROM loan_applications WHERE reference = $1', [reference])) reference = makeReference();

  const duration = parseInt(payload.duration_months, 10) || null;
  const inserted = await db.one(`
    INSERT INTO loan_applications (reference, user_id, amount, purpose, duration_months, payload, language, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING id
  `, [
    reference,
    req.user.id,
    amount,
    String(payload.loan_purpose).slice(0, 500),
    duration,
    JSON.stringify(payload),
    payload.language === 'fr' ? 'fr' : 'en',
  ]);

  res.status(201).json({ ok: true, reference, id: inserted.id });
}));

/** GET /api/loans/mine — the member's own applications. */
loansRouter.get('/mine', ah(async (req, res) => {
  const loans = await db.all(`
    SELECT id, reference, amount, purpose, status, decision_note, created_at, decided_at
    FROM loan_applications
    WHERE user_id = $1
    ORDER BY created_at DESC
  `, [req.user.id]);
  res.json({ loans });
}));

/**
 * Computes the active approved loan and outstanding balance for a user.
 * Outstanding = approved amount − sum of repayments (never below 0).
 * Returns null when there is no approved loan. Exported for reuse in admin.
 */
export async function outstandingForUser(userId) {
  const loan = await db.one(`
    SELECT * FROM loan_applications
    WHERE user_id = $1 AND status = 'approved'
    ORDER BY id DESC LIMIT 1
  `, [userId]);
  if (!loan) return null;
  const row = await db.one('SELECT COALESCE(SUM(amount),0)::bigint AS s FROM loan_repayments WHERE loan_id = $1', [loan.id]);
  const repaid = money.fromDb(row.s);
  return { loan, repaid, outstanding: Math.max(0, money.subtract(money.fromDb(loan.amount), repaid)) };
}

/** The member's savings account (falls back to their first account). */
async function savingsAccountFor(userId) {
  return (await db.one("SELECT * FROM accounts WHERE user_id = $1 AND type = 'savings' ORDER BY id LIMIT 1", [userId]))
    || (await db.one('SELECT * FROM accounts WHERE user_id = $1 ORDER BY id LIMIT 1', [userId]));
}

/**
 * Posts a repayment: debits the savings account and records the repayment.
 * Atomic. Shared by the member "repay now" route and the admin entry route.
 * Returns { ok } or throws an Error with a friendly message.
 */
export async function postRepayment(userId, amount, description, createdBy) {
  const amt = money.fromUser(amount); // throws MoneyError if not a positive whole amount
  const o = await outstandingForUser(userId);
  if (!o) throw new Error('This member has no active loan to repay.');
  if (amt > o.outstanding) throw new Error('Repayment exceeds the outstanding balance.');

  const savings = await savingsAccountFor(userId);
  if (!savings) throw new Error('No savings account found.');
  const savingsBal = money.fromDb(savings.balance);
  if (savingsBal < amt) throw new Error('Not enough funds in the savings account to make this repayment.');

  await db.tx(async (t) => {
    const note = (description || `Loan repayment ${o.loan.reference}`).slice(0, 200);
    // Money leaves savings to pay down the loan. Ledger counter is loans
    // receivable (asset down), not cash. Locking + balance + history + ledger
    // all handled in postToAccount.
    const posted = await postToAccount(t, {
      accountId: savings.id, delta: -amt, kind: 'loan_repayment', description: note,
      createdBy, ledgerCounter: 'LOANS_RECEIVABLE',
    });
    await t.run(`
      INSERT INTO loan_repayments (loan_id, account_id, transaction_id, amount, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [o.loan.id, savings.id, posted.transactionId, amt, note, createdBy]);
  });
  return { ok: true };
}

/** GET /api/loans/balance — the member's outstanding loan balance + history. */
loansRouter.get('/balance', ah(async (req, res) => {
  const o = await outstandingForUser(req.user.id);
  if (!o) return res.json({ loan: null });
  const repayments = await db.all(
    'SELECT id, amount, description, created_at FROM loan_repayments WHERE loan_id = $1 ORDER BY created_at DESC',
    [o.loan.id]
  );
  const savings = await savingsAccountFor(req.user.id);
  res.json({
    loan: {
      reference: o.loan.reference, amount: o.loan.amount, purpose: o.loan.purpose,
      duration_months: o.loan.duration_months, monthly_deduction: o.loan.monthly_deduction,
    },
    repaid: o.repaid, outstanding: o.outstanding,
    savings_balance: savings ? savings.balance : 0,
    repayments,
  });
}));

/** PUT /api/loans/monthly-deduction  { amount } — member sets their monthly deduction. */
loansRouter.put('/monthly-deduction', ah(async (req, res) => {
  let amt;
  try { amt = money.fromUser(req.body?.amount); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  const o = await outstandingForUser(req.user.id);
  if (!o) return res.status(400).json({ error: 'You have no active loan.' });
  await db.run('UPDATE loan_applications SET monthly_deduction = $1 WHERE id = $2', [amt, o.loan.id]);
  res.json({ ok: true, monthly_deduction: amt });
}));

/**
 * POST /api/loans/repay — member triggers a repayment from their savings.
 * Body: { amount } (optional; defaults to the monthly deduction).
 */
loansRouter.post('/repay', ah(async (req, res) => {
  const idem = await beginIdempotent(req, 'repay');
  if (idem.replay) return res.json(idem.response);
  const o = await outstandingForUser(req.user.id);
  if (!o) return res.status(400).json({ error: 'You have no active loan to repay.' });
  const raw = req.body?.amount != null ? req.body.amount : o.loan.monthly_deduction;
  let amt;
  try { amt = money.fromUser(raw); }
  catch { return res.status(400).json({ error: 'Set a monthly repayment amount first.' }); }
  try {
    await postRepayment(req.user.id, Math.min(amt, o.outstanding), 'Monthly repayment', req.user.id);
    const response = { ok: true };
    await idem.finish(200, response);
    res.json(response);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

/**
 * POST /api/loans/deposit-intent — mobile money deposit.
 * The feature is not available yet, so this always returns "coming soon"
 * and never moves money. Wired now so the UI has a real endpoint to call.
 */
loansRouter.post('/deposit-intent', ah(async (req, res) => {
  res.status(503).json({
    available: false,
    message: 'Mobile money deposits are not available yet. This feature is being set up with our payment partners and will be enabled soon.',
  });
}));
