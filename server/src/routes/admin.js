import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { requireAuth, requireRole, requirePasswordChanged, canViewBranch, canEditBranch, requireEditMember, blockFinancialAdmin } from '../middleware/auth.js';
import { record, listAudit } from '../lib/audit.js';
import { outstandingForUser, postRepayment } from './loans.js';
import { getContent, setContent } from '../lib/content.js';
import { branchNames, listBranches, headquarters } from '../lib/branches.js';
import { TITLE_KEYS, roleForTitle, isAlwaysEditor, titleLabel } from '../lib/titles.js';
import { ah } from '../lib/async-handler.js';
import * as money from '../lib/money.js';
import { validateImageDataUrl } from '../lib/image.js';
import { validate, v } from '../lib/validate.js';
import { getApprovalThreshold, setApprovalThreshold, getRequire2fa, setRequire2fa, getMemberGraceStart, memberGraceStatus, MEMBER_GRACE_DAYS, twofaHardForced } from '../lib/settings.js';
import { canApprovePending } from '../lib/maker-checker.js';
import { notify } from '../lib/notify.js';
import { postToAccount } from '../lib/post-money.js';
import { reconcile, trialBalance } from '../lib/ledger.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requirePasswordChanged, requireRole('staff', 'manager', 'admin'));

/**
 * Server-side enforcement of the 2FA requirement for staff.
 * The client forces enrolment at login, but that is only convenience — real
 * enforcement must be here, or someone could bypass the UI and call the API
 * directly. If 2FA is required for this user's role and they haven't enabled it,
 * every staff/admin action below is refused until they do. The DB value is read
 * live (not from the token) so flipping the requirement takes effect at once.
 * The 2FA setup endpoints live on /api/me, so a non-compliant user can still go
 * and enable 2FA to unblock themselves.
 */
adminRouter.use(ah(async (req, res, next) => {
  const level = await getRequire2fa();
  if (!twofaHardForced(req.user.role, level)) return next();
  const u = await db.one('SELECT twofa_enabled FROM users WHERE id = $1', [req.user.id]);
  if (u && u.twofa_enabled) return next();
  return res.status(403).json({
    error: 'Two-factor authentication is now required for staff. Please set it up on the Security page before continuing.',
    code: 'twofa_setup_required',
  });
}));

/** GET /api/admin/loans?status=pending — loan queue. */
adminRouter.get('/loans', blockFinancialAdmin, ah(async (req, res) => {
  const { status } = req.query;
  const base = `
    SELECT l.id, l.reference, l.amount, l.purpose, l.status, l.language,
           l.decision_note, l.created_at, l.decided_at,
           u.full_name AS applicant_name, u.username AS applicant_username, u.branch AS applicant_branch
    FROM loan_applications l
    JOIN users u ON u.id = l.user_id
  `;
  const conds = [];
  const params = [];
  if (status) { params.push(status); conds.push(`l.status = $${params.length}`); }
  // Staff only see applications from members in their own branch.
  if (req.user.role === 'staff') { params.push(req.user.branch); conds.push(`u.branch = $${params.length}`); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const rows = await db.all(base + where + ' ORDER BY l.created_at DESC', params);
  res.json({ loans: rows });
}));

/** GET /api/admin/loans/:id — full application detail incl. the raw form payload. */
adminRouter.get('/loans/:id', blockFinancialAdmin, ah(async (req, res) => {
  const loan = await db.one(`
    SELECT l.*, u.full_name AS applicant_name, u.username AS applicant_username,
           u.email AS applicant_email, u.phone AS applicant_phone
    FROM loan_applications l
    JOIN users u ON u.id = l.user_id
    WHERE l.id = $1
  `, [req.params.id]);
  if (!loan) return res.status(404).json({ error: 'Application not found.' });
  const applicant = await db.one('SELECT branch FROM users WHERE id = $1', [loan.user_id]);
  if (!applicant || !canViewBranch(req.user, applicant.branch)) {
    return res.status(403).json({ error: 'You can only view applications from your own branch.' });
  }
  let payload = {};
  try { payload = JSON.parse(loan.payload); } catch { /* ignore */ }
  loan.payload = payload;
  res.json({ loan });
}));

/**
 * POST /api/admin/loans/:id/decision — approve or reject.
 * Body: { decision: 'approved'|'rejected'|'under_review', note }
 */
adminRouter.post('/loans/:id/decision', blockFinancialAdmin, ah(async (req, res) => {
  const { decision, note } = req.body || {};
  const allowed = ['approved', 'rejected', 'under_review'];
  if (!allowed.includes(decision)) {
    return res.status(400).json({ error: 'Choose a valid decision.' });
  }
  const loan = await db.one('SELECT * FROM loan_applications WHERE id = $1', [req.params.id]);
  if (!loan) return res.status(404).json({ error: 'Application not found.' });
  const applicant = await db.one('SELECT branch FROM users WHERE id = $1', [loan.user_id]);
  if (!applicant || !canEditBranch(req.user, applicant.branch)) {
    return res.status(403).json({ error: 'You can only decide on applications in your own branch, and you need edit rights to do so.' });
  }

  // A final decision (approve/reject) stamps decided_at; sending it back to
  // review clears the timestamp.
  const decidedAtSql = decision === 'under_review' ? 'NULL' : 'now()';
  await db.run(`
    UPDATE loan_applications
    SET status = $1, decision_note = $2, decided_by = $3, decided_at = ${decidedAtSql}
    WHERE id = $4
  `, [decision, (note || '').slice(0, 500), req.user.id, loan.id]);

  await record(req, 'loan.decision', {
    targetType: 'loan', targetId: loan.id, branch: applicant.branch,
    summary: `Loan ${loan.reference} set to “${decision}”`,
  });
  // Notify the applicant only on a final decision (not when sent back to review).
  if (decision === 'approved' || decision === 'rejected') {
    notify.loanDecision(loan.user_id, {
      approved: decision === 'approved', reference: loan.reference,
      amount: money.fromDb(loan.amount), note: (note || '').slice(0, 200),
    });
  }
  res.json({ ok: true });
}));

/** GET /api/admin/members?branch=Douala — list members with balance and branch. */
adminRouter.get('/members', blockFinancialAdmin, ah(async (req, res) => {
  const params = [];
  let where = "WHERE u.role = 'member'";
  // Staff are locked to their own branch; managers/admins may filter freely.
  if (req.user.role === 'staff') {
    params.push(req.user.branch);
    where += ` AND u.branch = $${params.length}`;
  } else {
    const branch = req.query.branch;
    if (branch && branch !== 'all') { params.push(branch); where += ` AND u.branch = $${params.length}`; }
  }
  const members = await db.all(`
    SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.review_status, u.applicant_type, u.branch, u.created_at,
           COALESCE(SUM(a.balance), 0)::bigint AS total_balance,
           COUNT(a.id)::int AS account_count
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id
    ${where}
    GROUP BY u.id
    ORDER BY u.branch, (u.review_status = 'pending_review') DESC, u.full_name
  `, params);
  for (const m of members) {
    const o = await outstandingForUser(m.id);
    m.outstanding = o ? o.outstanding : 0;
  }
  // Tell the client what this user may do, so the UI can reflect it (server still enforces).
  res.json({
    members,
    branches: await branchNames(),
    scope: {
      role: req.user.role,
      branch: req.user.branch,
      can_edit: req.user.role === 'manager' ? 1 : (req.user.can_edit ? 1 : 0),
      all_branches: req.user.role === 'manager',
    },
  });
}));

/** GET /api/admin/members/:id — a member's profile + accounts. */
adminRouter.get('/members/:id', blockFinancialAdmin, ah(async (req, res) => {
  const member = await db.one('SELECT id, username, full_name, email, phone, role, review_status, applicant_type, branch, profile, created_at FROM users WHERE id = $1', [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  // Staff may only open members in their own branch.
  if (!canViewBranch(req.user, member.branch)) {
    return res.status(403).json({ error: 'You can only view members in your own branch.' });
  }
  // Parse the stored registration profile, if any.
  try { member.profile = member.profile ? JSON.parse(member.profile) : null; } catch { member.profile = null; }
  const accounts = await db.all('SELECT id, account_number, type, balance, currency, status FROM accounts WHERE user_id = $1 ORDER BY id', [member.id]);
  const o = await outstandingForUser(member.id);
  const outstanding = o ? { reference: o.loan.reference, amount: o.loan.amount, outstanding: o.outstanding, monthly_deduction: o.loan.monthly_deduction } : null;
  // The client uses this to show/hide edit controls; the server still enforces on write.
  const may_edit = canEditBranch(req.user, member.branch);
  const all_branches = req.user.role === 'manager';
  res.json({ member, accounts, outstanding, may_edit, all_branches });
}));

/** POST /api/admin/members/:id/mark-reviewed — clears the pending_review flag. */
adminRouter.post('/members/:id/mark-reviewed', blockFinancialAdmin, requireEditMember(), ah(async (req, res) => {
  await db.run("UPDATE users SET review_status = 'active' WHERE id = $1", [req.member.id]);
  await record(req, 'member.reviewed', {
    targetType: 'member', targetId: req.member.id, branch: req.member.branch,
    summary: `Marked ${req.member.full_name} as reviewed`,
  });
  res.json({ ok: true });
}));

/** POST /api/admin/members/:id/branch  { branch } — reassign a member's branch.
 * Moving a member between branches is a manager/admin action only. */
adminRouter.post('/members/:id/branch', requireRole('manager'), ah(async (req, res) => {
  const branch = String(req.body?.branch || '').trim();
  if (!(await branchNames()).includes(branch)) {
    return res.status(400).json({ error: 'Choose a valid branch.' });
  }
  const member = await db.one('SELECT id, full_name, branch FROM users WHERE id = $1 AND role = $2', [req.params.id, 'member']);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  await db.run('UPDATE users SET branch = $1 WHERE id = $2', [branch, member.id]);
  await record(req, 'member.reassign', {
    targetType: 'member', targetId: member.id, branch,
    summary: `Reassigned ${member.full_name} from ${member.branch} to ${branch}`,
  });
  res.json({ ok: true, branch });
}));

/**
 * POST /api/admin/accounts/:id/entry — post a credit or debit to an account.
 * This stands in for the future "deposit money" feature and manual adjustments.
 * Body: { amount, kind, description }   amount > 0 credits, amount < 0 debits.
 */
adminRouter.post('/accounts/:id/entry', blockFinancialAdmin, ah(async (req, res) => {
  const { amount, kind, description } = req.body || {};
  const validKinds = ['deposit', 'withdrawal', 'adjustment', 'loan_disbursement'];

  // Entries can be positive (credit) or negative (debit); validate as a signed
  // whole-franc amount in safe range, then reject zero.
  let amt;
  try {
    amt = money.fromUser(amount, { allowZero: true, min: 0 });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (amt === 0) {
    return res.status(400).json({ error: 'Enter a non-zero amount.' });
  }
  if (!validKinds.includes(kind)) {
    return res.status(400).json({ error: 'Choose a valid entry type.' });
  }

  const account = await db.one('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  // The actor must have edit rights over the branch of the account's owner.
  const owner = await db.one('SELECT branch FROM users WHERE id = $1', [account.user_id]);
  if (!owner || !canEditBranch(req.user, owner.branch)) {
    return res.status(403).json({ error: 'You can only post entries for members in your own branch, and you need edit rights to do so.' });
  }
  if (account.status !== 'active') {
    return res.status(400).json({ error: 'This account is not active.' });
  }
  const newBalance = money.add(money.fromDb(account.balance), amt);
  if (newBalance < 0) {
    return res.status(400).json({ error: 'This would overdraw the account.' });
  }

  // Maker-checker: at or above the approval threshold, this entry does NOT move
  // money now. It is queued for a second person to approve. We compare on the
  // absolute amount, so a large debit is controlled just like a large credit.
  const threshold = await getApprovalThreshold();
  if (Math.abs(amt) >= threshold) {
    const pending = await db.one(`
      INSERT INTO pending_entries (account_id, amount, kind, description, branch, requested_by, requested_by_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [account.id, amt, kind, (description || '').slice(0, 200), owner.branch, req.user.id, req.user.name]);
    await record(req, 'entry.pending', {
      targetType: 'account', targetId: account.id, branch: owner.branch,
      summary: `Requested approval: ${kind} (${amt >= 0 ? 'credit' : 'debit'} ${Math.abs(amt)} FCFA) on account ${account.account_number}`,
    });
    return res.status(202).json({
      ok: true,
      pending: true,
      pending_id: pending.id,
      message: 'This amount is above the approval limit. It has been sent to a supervisor for approval before the money moves.',
    });
  }

  const posted = await db.tx(async (t) => {
    return postToAccount(t, {
      accountId: account.id, delta: amt, kind, description: (description || '').slice(0, 200),
      createdBy: req.user.id,
      ledgerCounter: kind === 'adjustment' ? 'ADJUSTMENTS' : 'CASH',
      allowNegative: kind === 'adjustment',
    });
  });
  // (newBalance was pre-computed above for the threshold/insufficient-funds check;
  // posted.balance is the authoritative post-lock result and should match it.)

  // Adjustments get their own action key so they're easy to audit specifically.
  const action = kind === 'adjustment' ? 'account.adjustment' : 'account.entry';
  const verb = amt >= 0 ? 'credit' : 'debit';
  await record(req, action, {
    targetType: 'account', targetId: account.id, branch: owner.branch,
    summary: `${kind === 'adjustment' ? 'Adjustment' : kind} (${verb} ${Math.abs(amt)} FCFA) on account ${account.account_number}${description ? ' — ' + String(description).slice(0, 120) : ''}`,
  });
  // Tell the member their money moved (best-effort — never blocks the response).
  notify.transaction(owner.id, {
    credit: amt >= 0, amount: amt, account: account.account_number,
    balance: newBalance, when: new Date().toISOString().slice(0, 16).replace('T', ' '),
  });
  res.json({ ok: true, balance: newBalance });
}));

/**
 * Maker-checker approval queue.
 * ─────────────────────────────────────────────────────────────────────────────
 * Who may approve a pending entry is decided by canApprovePending (see
 * lib/maker-checker.js): admin and General Manager anywhere; a Branch Manager
 * only for their own branch; and never the person who requested it.
 */

/** GET /api/admin/pending — the approval queue, scoped to what the viewer may act on. */
adminRouter.get('/pending', blockFinancialAdmin, requireRole('staff', 'manager'), ah(async (req, res) => {
  const rows = await db.all(
    "SELECT * FROM pending_entries WHERE status = 'pending' ORDER BY created_at ASC"
  );
  // Attach account number and whether THIS viewer may approve each one.
  const out = [];
  for (const p of rows) {
    const acct = await db.one('SELECT account_number FROM accounts WHERE id = $1', [p.account_id]);
    out.push({
      ...p,
      account_number: acct ? acct.account_number : null,
      can_approve: canApprovePending(req.user, p),
      is_mine: req.user.id === p.requested_by,
    });
  }
  // A Branch Manager / staff only needs to see their own branch's queue; the GM
  // sees everything. (The IT admin has no access to this route at all.)
  const visible = req.user.role === 'manager'
    ? out
    : out.filter((p) => p.branch === req.user.branch);
  res.json({ pending: visible, threshold: await getApprovalThreshold() });
}));

/** POST /api/admin/pending/:id/approve — approve and actually move the money. */
adminRouter.post('/pending/:id/approve', blockFinancialAdmin, requireRole('staff', 'manager'), ah(async (req, res) => {
  const pending = await db.one('SELECT * FROM pending_entries WHERE id = $1', [req.params.id]);
  if (!pending) return res.status(404).json({ error: 'Request not found.' });
  if (pending.status !== 'pending') return res.status(409).json({ error: 'This request has already been handled.' });
  if (!canApprovePending(req.user, pending)) {
    return res.status(403).json({
      error: req.user.id === pending.requested_by
        ? 'You cannot approve a transaction you requested yourself.'
        : 'You are not allowed to approve this transaction.',
    });
  }

  // Re-validate against the CURRENT balance — the account may have changed while
  // this sat in the queue, so we never trust the amount computed at request time.
  const account = await db.one('SELECT * FROM accounts WHERE id = $1', [pending.account_id]);
  if (!account) return res.status(404).json({ error: 'Account no longer exists.' });
  if (account.status !== 'active') return res.status(400).json({ error: 'This account is not active.' });
  const amt = money.fromDb(pending.amount);
  const newBalance = money.add(money.fromDb(account.balance), amt);
  if (newBalance < 0) {
    return res.status(400).json({ error: 'This would now overdraw the account; the balance changed since the request. Reject it and re-enter if needed.' });
  }

  const txId = await db.tx(async (t) => {
    const posted = await postToAccount(t, {
      accountId: account.id, delta: amt, kind: pending.kind,
      description: (pending.description || '').slice(0, 200),
      createdBy: pending.requested_by,
      ledgerCounter: pending.kind === 'adjustment' ? 'ADJUSTMENTS' : 'CASH',
      allowNegative: pending.kind === 'adjustment',
    });
    await t.run(`
      UPDATE pending_entries
      SET status = 'approved', decided_by = $1, decided_by_name = $2, decided_at = now(), transaction_id = $3
      WHERE id = $4
    `, [req.user.id, req.user.name, posted.transactionId, pending.id]);
    return posted.transactionId;
  });

  await record(req, 'entry.approved', {
    targetType: 'account', targetId: account.id, branch: pending.branch,
    summary: `Approved ${pending.kind} (${amt >= 0 ? 'credit' : 'debit'} ${Math.abs(amt)} FCFA) on account ${account.account_number}, requested by ${pending.requested_by_name}`,
  });
  // Notify the account owner now that the money has actually moved.
  const owner2 = await db.one('SELECT user_id FROM accounts WHERE id = $1', [account.id]);
  if (owner2) notify.transaction(owner2.user_id, {
    credit: amt >= 0, amount: amt, account: account.account_number,
    balance: newBalance, when: new Date().toISOString().slice(0, 16).replace('T', ' '),
  });
  res.json({ ok: true, balance: newBalance, transaction_id: txId });
}));

/** POST /api/admin/pending/:id/reject — reject without moving money. */
adminRouter.post('/pending/:id/reject', blockFinancialAdmin, requireRole('staff', 'manager'), ah(async (req, res) => {
  const pending = await db.one('SELECT * FROM pending_entries WHERE id = $1', [req.params.id]);
  if (!pending) return res.status(404).json({ error: 'Request not found.' });
  if (pending.status !== 'pending') return res.status(409).json({ error: 'This request has already been handled.' });
  if (!canApprovePending(req.user, pending)) {
    return res.status(403).json({
      error: req.user.id === pending.requested_by
        ? 'You cannot reject a transaction you requested yourself (you can cancel it instead).'
        : 'You are not allowed to act on this transaction.',
    });
  }
  const note = (req.body?.note || '').toString().slice(0, 200);
  await db.run(
    "UPDATE pending_entries SET status = 'rejected', decided_by = $1, decided_by_name = $2, decision_note = $3, decided_at = now() WHERE id = $4",
    [req.user.id, req.user.name, note, pending.id]
  );
  await record(req, 'entry.rejected', {
    targetType: 'account', targetId: pending.account_id, branch: pending.branch,
    summary: `Rejected ${pending.kind} (${money.fromDb(pending.amount)} FCFA), requested by ${pending.requested_by_name}${note ? ' — ' + note : ''}`,
  });
  res.json({ ok: true });
}));

/** POST /api/admin/pending/:id/cancel — the requester withdraws their own pending request. */
adminRouter.post('/pending/:id/cancel', blockFinancialAdmin, requireRole('staff', 'manager'), ah(async (req, res) => {
  const pending = await db.one('SELECT * FROM pending_entries WHERE id = $1', [req.params.id]);
  if (!pending) return res.status(404).json({ error: 'Request not found.' });
  if (pending.status !== 'pending') return res.status(409).json({ error: 'This request has already been handled.' });
  if (pending.requested_by !== req.user.id) {
    return res.status(403).json({ error: 'Only the person who requested this can cancel it.' });
  }
  await db.run(
    "UPDATE pending_entries SET status = 'cancelled', decided_by = $1, decided_by_name = $2, decided_at = now() WHERE id = $3",
    [req.user.id, req.user.name, pending.id]
  );
  await record(req, 'entry.cancelled', {
    targetType: 'account', targetId: pending.account_id, branch: pending.branch,
    summary: `Cancelled own pending ${pending.kind} (${money.fromDb(pending.amount)} FCFA)`,
  });
  res.json({ ok: true });
}));

/** GET /api/admin/settings — read admin settings (admin + GM). */
adminRouter.get('/settings', requireRole('manager', 'admin'), ah(async (req, res) => {
  const level = await getRequire2fa();
  const since = await getMemberGraceStart();
  const grace = memberGraceStatus(level, since);
  res.json({
    approval_threshold: await getApprovalThreshold(),
    require_2fa: level,
    member_grace_days_total: MEMBER_GRACE_DAYS,
    member_grace_days_remaining: grace.active ? grace.days_remaining : null,
    member_grace_since: grace.since,
  });
}));

/** PUT /api/admin/settings/require-2fa — require 2FA for staff and/or members (admin only).
 *  Accepts either { level } ('off'|'staff'|'all') or two independent booleans
 *  { require_staff, require_members } which map to a level:
 *    neither → 'off',  staff only → 'staff',  both (or members) → 'all'.
 *  Nobody is hard-locked out: users without 2FA are walked through setup at next
 *  login (members get a 10-day grace period first). */
adminRouter.put('/settings/require-2fa', requireRole('admin'), ah(async (req, res) => {
  try {
    let level = req.body?.level;
    if (level === undefined) {
      const staff = !!req.body?.require_staff;
      const members = !!req.body?.require_members;
      // Requiring members implies staff/admin too (you can't secure members while
      // leaving the people who move their money unprotected).
      level = members ? 'all' : (staff ? 'staff' : 'off');
    }
    level = await setRequire2fa(level, req.user.id);
    await record(req, 'settings.require_2fa', { summary: `Set 2FA requirement to '${level}'` });
    // Tell the admin if they themselves don't yet have 2FA on, so the enforcement
    // doesn't surprise them at their next login.
    const me = await db.one('SELECT twofa_enabled FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true, require_2fa: level, self_needs_setup: me && !me.twofa_enabled ? 1 : 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

/** PUT /api/admin/settings/threshold — change the approval threshold (admin only). */
adminRouter.put('/settings/threshold', requireRole('admin'), ah(async (req, res) => {
  try {
    const value = await setApprovalThreshold(req.body?.amount, req.user.id);
    await record(req, 'settings.threshold', { summary: `Set approval threshold to ${value} FCFA` });
    res.json({ ok: true, approval_threshold: value });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

/**
 * POST /api/admin/members/:id/repay — staff posts a loan repayment for a member.
 * Debits the member's savings account and reduces their outstanding loan.
 * Body: { amount, description }
 */
adminRouter.post('/members/:id/repay', blockFinancialAdmin, requireEditMember(), ah(async (req, res) => {
  const memberId = req.member.id;
  try {
    await postRepayment(memberId, req.body?.amount, req.body?.description, req.user.id);
    const o = await outstandingForUser(memberId);
    await record(req, 'loan.repayment', {
      targetType: 'member', targetId: memberId, branch: req.member.branch,
      summary: `Posted a ${Math.abs(parseInt(req.body?.amount, 10) || 0)} FCFA loan repayment for ${req.member.full_name}`,
    });
    res.json({ ok: true, outstanding: o ? o.outstanding : 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

/* ── Website content (team / careers / contact) ──────────────────────────── */

/** GET /api/admin/content/:section — current content for editing. */
adminRouter.get('/content/:section', requireRole('admin'), ah(async (req, res) => {
  const allowed = ['team', 'careers', 'contact', 'landing', 'login', 'register', 'privacy', 'terms'];
  if (!allowed.includes(req.params.section)) {
    return res.status(404).json({ error: 'Unknown content section.' });
  }
  res.json({ section: req.params.section, data: await getContent(req.params.section) });
}));

/** PUT /api/admin/content/:section — save edited content. */
adminRouter.put('/content/:section', requireRole('admin'), ah(async (req, res) => {
  const allowed = ['team', 'careers', 'contact', 'landing', 'login', 'register', 'privacy', 'terms'];
  const { section } = req.params;
  if (!allowed.includes(section)) {
    return res.status(404).json({ error: 'Unknown content section.' });
  }
  if (typeof req.body?.data !== 'object' || req.body.data === null) {
    return res.status(400).json({ error: 'Missing content data.' });
  }
  const saved = await setContent(section, req.body.data, req.user.id);
  res.json({ ok: true, section, data: saved });
}));

/* ── Staff creates a member directly ─────────────────────────────────────── */

/**
 * POST /api/admin/members  — staff/admin create a member account.
 * Email is the username; a temporary password is required and is given to the
 * member to change on first login. The account is active (staff-created, so
 * already reviewed). No bank accounts are opened here — do that separately.
 */
adminRouter.post('/members', ah(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const fullName = String(b.full_name || '').trim();
  const password = String(b.password || '');
  const phone = String(b.phone || '').trim();
  // Staff may only create members in their own branch; managers/admins choose any.
  const branch = (req.user.role === 'staff') ? req.user.branch : String(b.branch || '').trim();

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!fullName) return res.status(400).json({ error: 'Enter the member\u2019s full name.' });
  if (password.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
  if (!(await branchNames()).includes(branch)) return res.status(400).json({ error: 'Choose a valid branch.' });
  // Must have edit rights over that branch to create there.
  if (!canEditBranch(req.user, branch)) {
    return res.status(403).json({ error: 'You can only create members in your own branch, and you need edit rights to do so.' });
  }
  const exists = await db.one('SELECT id FROM users WHERE username = $1 OR email = $2', [email, email]);
  if (exists) return res.status(409).json({ error: 'A user with that email already exists.' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const inserted = await db.one(`
    INSERT INTO users (username, password_hash, full_name, email, phone, role, review_status, applicant_type, branch, profile)
    VALUES ($1, $2, $3, $4, $5, 'member', 'active', 'individual', $6, $7)
    RETURNING id
  `, [email, passwordHash, fullName, email, phone || null, branch, JSON.stringify({ created_by_staff: true })]);

  await record(req, 'member.create', {
    targetType: 'member', targetId: inserted.id, branch,
    summary: `Created member account for ${fullName} (${email}) in ${branch}`,
  });
  res.status(201).json({ ok: true, id: inserted.id, username: email });
}));

/* ── Branch management (add / edit / rename / delete) ────────────────────── */

adminRouter.get('/branches', ah(async (req, res) => {
  res.json({ branches: await listBranches() });
}));

adminRouter.post('/branches', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Branch name is required.' });
  const exists = await db.one('SELECT id FROM branches WHERE name = $1', [name]);
  if (exists) return res.status(409).json({ error: 'A branch with that name already exists.' });
  const row = await db.one('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM branches');
  const inserted = await db.one(`
    INSERT INTO branches (name, is_hq, address, phone, email, manager_name, office_photo, description, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `, [name, b.is_hq ? 1 : 0, b.address || null, b.phone || null, b.email || null, b.manager_name || null, b.office_photo || null, b.description || null, row.m + 1]);
  res.status(201).json({ ok: true, id: inserted.id });
}));

adminRouter.put('/branches/:id', requireRole('admin'), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.one('SELECT id, name FROM branches WHERE id = $1', [id]);
  if (!row) return res.status(404).json({ error: 'Branch not found.' });
  const b = req.body || {};
  const name = String(b.name || row.name).trim();
  if (!name) return res.status(400).json({ error: 'Branch name is required.' });
  const clash = await db.one('SELECT id FROM branches WHERE name = $1 AND id != $2', [name, id]);
  if (clash) return res.status(409).json({ error: 'Another branch already has that name.' });
  // If this branch is renamed, keep members pointing at the new name.
  if (name !== row.name) {
    await db.run('UPDATE users SET branch = $1 WHERE branch = $2', [name, row.name]);
  }
  await db.run(`
    UPDATE branches SET name = $1, is_hq = $2, address = $3, phone = $4, email = $5, manager_name = $6, office_photo = $7, description = $8 WHERE id = $9
  `, [name, b.is_hq ? 1 : 0, b.address || null, b.phone || null, b.email || null, b.manager_name || null, b.office_photo || null, b.description || null, id]);
  res.json({ ok: true });
}));

adminRouter.delete('/branches/:id', requireRole('admin'), ah(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = await db.one('SELECT id, name FROM branches WHERE id = $1', [id]);
  if (!row) return res.status(404).json({ error: 'Branch not found.' });
  const cnt = await db.one('SELECT COUNT(*)::int AS n FROM branches');
  if (cnt.n <= 1) return res.status(400).json({ error: 'You must keep at least one branch.' });
  const mem = await db.one('SELECT COUNT(*)::int AS n FROM users WHERE branch = $1', [row.name]);
  if (mem.n > 0) {
    return res.status(400).json({ error: `This branch has ${mem.n} member(s). Reassign them to another branch before deleting.` });
  }
  await db.run('DELETE FROM branches WHERE id = $1', [id]);
  res.json({ ok: true });
}));

/* ── Image upload (stored inline as base64 data URLs) ────────────────────── */

adminRouter.post('/images', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const dataUrl = String(b.data_url || '');
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  if (!m) return res.status(400).json({ error: 'Provide an image as a base64 data URL.' });
  // Guard against very large payloads (~1.5MB of base64 ≈ ~1.1MB image).
  if (dataUrl.length > 2_000_000) {
    return res.status(413).json({ error: 'Image is too large. Please use an image under about 1 MB.' });
  }
  const id = Math.random().toString(36).slice(2, 10);
  await db.run(`
    INSERT INTO images (id, purpose, mime, data_url, label, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, String(b.purpose || 'other'), m[1], dataUrl, String(b.label || ''), req.user.id]);
  res.status(201).json({ ok: true, id });
}));

adminRouter.delete('/images/:id', requireRole('admin'), ah(async (req, res) => {
  await db.run('DELETE FROM images WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

/* ── Staff accounts with job titles (admin only) ─────────────────────────── */
// Titles are labels (General Manager, Branch Manager, Loans Officer, Cashier,
// Intern). General Manager is the single institution-wide manager. Within a
// branch the Branch Manager is always an editor, plus AT MOST ONE other staff
// may hold edit rights. Only the admin can create, grant rights, or remove.

/** Non-branch-manager editors currently in a branch (the "one other" slot). */
async function otherEditorCount(branch, exceptId = null) {
  const rows = await db.all(
    "SELECT id, title FROM users WHERE role = 'staff' AND can_edit = 1 AND branch = $1",
    [branch]
  );
  return rows.filter((r) => r.title !== 'branch_manager' && r.id !== exceptId).length;
}

/** Does this branch already have a Branch Manager (optionally excluding one id)? */
async function hasBranchManager(branch, exceptId = null) {
  const row = exceptId
    ? await db.one("SELECT id FROM users WHERE role = 'staff' AND title = 'branch_manager' AND branch = $1 AND id != $2", [branch, exceptId])
    : await db.one("SELECT id FROM users WHERE role = 'staff' AND title = 'branch_manager' AND branch = $1", [branch]);
  return !!row;
}

/** Next employee ID in the SOWO#### series (starts at SOWO1000). */
async function nextEmployeeId() {
  const rows = await db.all("SELECT employee_id FROM users WHERE employee_id LIKE 'SOWO%'");
  let max = 999;
  for (const r of rows) {
    const n = parseInt(String(r.employee_id).replace(/^SOWO/, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return 'SOWO' + (max + 1);
}

/** GET /api/admin/staff — all staff/manager with titles. */
adminRouter.get('/staff', requireRole('admin'), ah(async (req, res) => {
  const staff = await db.all(
    "SELECT id, username, full_name, email, phone, role, title, employee_id, branch, can_edit, staff_photo, bio, start_date, work_extension, languages, twofa_enabled, created_at FROM users WHERE role IN ('staff','manager') ORDER BY role DESC, branch, full_name"
  );
  res.json({ staff, titles: TITLE_KEYS.map((k) => ({ key: k, label: titleLabel(k), role: roleForTitle(k) })) });
}));

/**
 * POST /api/admin/staff — create a staff account by job title (admin only).
 * Body: { full_name, email, password, phone, title, branch, can_edit }
 * The role is derived from the title. Branch Manager is always an editor; other
 * titles may hold the single "one other editor" slot if free.
 */
adminRouter.post('/staff', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const fullName = String(b.full_name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const phone = String(b.phone || '').trim();
  const title = TITLE_KEYS.includes(b.title) ? b.title : 'cashier';
  const role = roleForTitle(title);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!fullName) return res.status(400).json({ error: 'Enter the staff member\u2019s full name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });

  // Only one General Manager (institution-wide manager) for the whole institution.
  if (role === 'manager') {
    const existing = await db.one("SELECT id FROM users WHERE role = 'manager'");
    if (existing) {
      return res.status(409).json({ error: 'There is already a General Manager. Remove the current one first.' });
    }
  }

  let branch = String(b.branch || '').trim();
  const names = await branchNames();
  if (role === 'manager') {
    branch = branch && names.includes(branch) ? branch : await headquarters();
  } else {
    if (!names.includes(branch)) return res.status(400).json({ error: 'Choose a valid branch for this staff member.' });
  }

  // Decide edit rights.
  let canEdit;
  if (role === 'manager') {
    canEdit = 1; // General Manager edits everywhere
  } else if (isAlwaysEditor(title)) {
    // Branch Manager: always an editor, but only one per branch.
    if (await hasBranchManager(branch)) {
      return res.status(409).json({ error: 'This branch already has a Branch Manager. Remove or reassign the current one first.' });
    }
    canEdit = 1;
  } else {
    // Other titles: optional editor, limited to one non-Branch-Manager editor.
    canEdit = b.can_edit ? 1 : 0;
    if (canEdit && (await otherEditorCount(branch)) >= 1) {
      return res.status(409).json({ error: 'Besides the Branch Manager, only one other staff in a branch can have edit rights. Make the current one view-only first, or add this person as view-only.' });
    }
  }

  const exists = await db.one('SELECT id FROM users WHERE username = $1 OR email = $2', [email, email]);
  if (exists) return res.status(409).json({ error: 'A user with that email already exists.' });

  const employeeId = await nextEmployeeId();
  const passwordHash = bcrypt.hashSync(password, 10);

  // Optional profile details at creation time (all validated, all optional).
  const bio = b.bio ? String(b.bio).trim().slice(0, 600) : null;
  const startDate = (typeof b.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.start_date.trim())) ? b.start_date.trim() : null;
  const workExt = b.work_extension ? String(b.work_extension).trim().slice(0, 20) : null;
  const languages = b.languages ? String(b.languages).trim().slice(0, 200) : null;
  let staffPhoto = null;
  if (b.photo != null && b.photo !== '') {
    const img = validateImageDataUrl(b.photo);
    if (!img.ok) return res.status(400).json({ error: img.error, fields: { photo: img.error } });
    staffPhoto = img.dataUrl;
  }

  const inserted = await db.one(`
    INSERT INTO users (username, password_hash, full_name, email, phone, role, title, employee_id, must_change_password, review_status, applicant_type, branch, can_edit, profile, staff_photo, bio, start_date, work_extension, languages)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 'active', 'individual', $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id
  `, [email, passwordHash, fullName, email, phone || null, role, title, employeeId, branch, canEdit, JSON.stringify({ created_by_admin: true }), staffPhoto, bio, startDate, workExt, languages]);

  await record(req, 'staff.create', {
    targetType: 'staff', targetId: inserted.id, branch,
    summary: `Created ${titleLabel(title)} account for ${fullName} (${employeeId}) in ${branch}`,
  });
  res.status(201).json({ ok: true, id: inserted.id, username: email, role, title, branch, can_edit: canEdit, employee_id: employeeId });
}));

/**
 * PUT /api/admin/staff/:id/edit-rights  { can_edit } — grant/revoke edit rights
 * for a NON-Branch-Manager staff member. Branch Managers are always editors and
 * can't be toggled. Only one non-BM editor per branch. (admin only)
 */
adminRouter.put('/staff/:id/edit-rights', requireRole('admin'), ah(async (req, res) => {
  const staff = await db.one("SELECT id, full_name, role, title, branch, can_edit FROM users WHERE id = $1 AND role = 'staff'", [req.params.id]);
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });
  if (staff.title === 'branch_manager') {
    return res.status(400).json({ error: 'The Branch Manager always has edit rights and can\u2019t be made view-only.' });
  }
  const grant = req.body?.can_edit ? 1 : 0;
  if (grant && !staff.can_edit && (await otherEditorCount(staff.branch, staff.id)) >= 1) {
    return res.status(409).json({ error: 'Besides the Branch Manager, only one other staff in a branch can have edit rights. Make the current one view-only first.' });
  }
  await db.run('UPDATE users SET can_edit = $1 WHERE id = $2', [grant, staff.id]);
  await record(req, 'staff.edit_rights', {
    targetType: 'staff', targetId: staff.id, branch: staff.branch,
    summary: `${grant ? 'Granted' : 'Removed'} edit rights ${grant ? 'to' : 'from'} ${staff.full_name}`,
  });
  res.json({ ok: true, can_edit: grant });
}));

/** DELETE /api/admin/staff/:id — remove a staff or manager account (admin only). */
adminRouter.delete('/staff/:id', requireRole('admin'), ah(async (req, res) => {
  const staff = await db.one("SELECT id, full_name, role, branch, employee_id FROM users WHERE id = $1 AND role IN ('staff','manager')", [req.params.id]);
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });
  await db.run('DELETE FROM users WHERE id = $1', [staff.id]);
  await record(req, 'staff.remove', {
    targetType: 'staff', targetId: staff.id, branch: staff.branch,
    summary: `Removed ${staff.full_name}${staff.employee_id ? ' (' + staff.employee_id + ')' : ''}`,
  });
  res.json({ ok: true });
}));

/**
 * PUT /api/admin/staff/:id/profile — edit a staff member's profile details and
 * photo (admin only). Does NOT change role/title/branch/edit-rights — those have
 * their own guarded routes so the sensitive changes stay auditable and separate.
 * Body (all optional): { phone, bio, start_date, work_extension, languages, photo, remove_photo }
 * `photo` is a base64 data URL (jpeg/png/webp); `remove_photo: true` clears it.
 */
adminRouter.put('/staff/:id/profile', requireRole('admin'), ah(async (req, res) => {
  const staff = await db.one(
    "SELECT id, full_name, branch FROM users WHERE id = $1 AND role IN ('staff','manager')",
    [req.params.id]
  );
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });

  // Validate the text fields. Everything is optional; only provided fields change.
  const { ok, value, errors } = validate({
    phone: v.string().trim().max(30).optional(),
    bio: v.string().trim().max(600).optional(),
    start_date: v.string().trim().matches(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-01-31').optional(),
    work_extension: v.string().trim().max(20).optional(),
    languages: v.string().trim().max(200).optional(),
  }, req.body || {});
  if (!ok) return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });

  // Build the update from only the fields that were supplied.
  const sets = [];
  const params = [];
  const setField = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

  for (const key of ['phone', 'bio', 'start_date', 'work_extension', 'languages']) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      setField(key, value[key] ?? null);
    }
  }

  // Photo: validate signature/size, or clear if remove_photo requested.
  if (req.body?.remove_photo) {
    setField('staff_photo', null);
  } else if (req.body?.photo != null && req.body.photo !== '') {
    const img = validateImageDataUrl(req.body.photo);
    if (!img.ok) return res.status(400).json({ error: img.error, fields: { photo: img.error } });
    setField('staff_photo', img.dataUrl);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  params.push(staff.id);
  await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  await record(req, 'staff.profile_update', {
    targetType: 'staff', targetId: staff.id, branch: staff.branch,
    summary: `Updated profile for ${staff.full_name}`,
  });
  res.json({ ok: true });
}));

/** GET /api/admin/staff/:id — full detail for one staff member (admin only). */
adminRouter.get('/staff/:id', requireRole('admin'), ah(async (req, res) => {
  const staff = await db.one(
    "SELECT id, username, full_name, email, phone, role, title, employee_id, branch, can_edit, staff_photo, bio, start_date, work_extension, languages, twofa_enabled, created_at FROM users WHERE id = $1 AND role IN ('staff','manager')",
    [req.params.id]
  );
  if (!staff) return res.status(404).json({ error: 'Staff member not found.' });
  res.json({ staff });
}));

/**
 * POST /api/admin/staff/:id/reset-2fa — clear a staff member's 2FA (admin only).
 * For when someone loses their phone. It turns 2FA OFF and wipes their secret and
 * recovery codes, so they can sign in with just their password and re-enrol. It
 * also revokes their existing sessions. This is a powerful action, so it is
 * audited — and it's the reason the admin account itself must be well protected.
 */
adminRouter.post('/staff/:id/reset-2fa', requireRole('admin'), ah(async (req, res) => {
  const staff = await db.one("SELECT id, full_name, branch FROM users WHERE id = $1", [req.params.id]);
  if (!staff) return res.status(404).json({ error: 'User not found.' });
  await db.tx(async (t) => {
    await t.run('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL, token_version = token_version + 1 WHERE id = $1', [staff.id]);
    await t.run('DELETE FROM recovery_codes WHERE user_id = $1', [staff.id]);
  });
  await record(req, 'twofa.admin_reset', {
    targetType: 'user', targetId: staff.id, branch: staff.branch,
    summary: `Reset two-factor authentication for ${staff.full_name}`,
  });
  notify.security(staff.id, {
    title: 'Two-factor authentication reset',
    message: 'An administrator has reset the two-factor authentication on your account. You can sign in with your password and set it up again.',
  });
  res.json({ ok: true });
}));
/**
 * GET /api/admin/ledger/reconcile — prove the books balance.
 * Returns the global trial balance (all journal lines must sum to zero) and a
 * per-member-account reconciliation of the ledger against the cached balances.
 * The General Manager can run this any time; it's the evidence an auditor wants.
 * (The IT admin is excluded — this is member financial data.)
 */
adminRouter.get('/ledger/reconcile', requireRole('manager'), ah(async (req, res) => {
  const [tb, rec] = await Promise.all([trialBalance(), reconcile()]);
  res.json({
    trial_balance: tb,          // { ok, total } — total must be 0
    reconciliation: rec,        // { ok, checked, mismatches[] }
    healthy: tb.ok && rec.ok,
  });
}));

adminRouter.get('/audit', requireRole('manager', 'admin'), ah(async (req, res) => {
  const entries = await listAudit({ action: req.query.action || null, limit: req.query.limit || 200 });
  // The distinct actions present, so the UI can build a filter.
  const actions = (await db.all('SELECT DISTINCT action FROM audit_log ORDER BY action')).map((r) => r.action);
  res.json({ entries, actions });
}));

/* ── Member data-correction requests ─────────────────────────────────────── */

/** GET /api/admin/corrections — pending correction requests, scoped to branch. */
adminRouter.get('/corrections', ah(async (req, res) => {
  const rows = (await db.all(`
    SELECT c.id, c.user_id, c.fields, c.note, c.status, c.created_at,
           u.full_name AS member_name, u.branch AS member_branch, u.username AS member_username
    FROM correction_requests c JOIN users u ON u.id = c.user_id
    WHERE c.status = 'pending'
    ORDER BY c.created_at
  `)).filter((r) => canViewBranch(req.user, r.member_branch));
  for (const r of rows) { try { r.fields = JSON.parse(r.fields); } catch { r.fields = {}; } }
  res.json({ corrections: rows });
}));

/**
 * POST /api/admin/corrections/:id  { decision: 'apply'|'reject', staff_note }
 * Applying writes the requested values to the member's record (name/email on
 * the user row, other KYC fields into the profile JSON). Needs edit rights over
 * the member's branch.
 */
adminRouter.post('/corrections/:id', ah(async (req, res) => {
  const cr = await db.one('SELECT * FROM correction_requests WHERE id = $1', [req.params.id]);
  if (!cr) return res.status(404).json({ error: 'Request not found.' });
  if (cr.status !== 'pending') return res.status(400).json({ error: 'This request has already been handled.' });
  const member = await db.one('SELECT id, full_name, branch, profile FROM users WHERE id = $1', [cr.user_id]);
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  if (!canEditBranch(req.user, member.branch)) {
    return res.status(403).json({ error: 'You can only handle requests for your own branch, and you need edit rights to do so.' });
  }
  const decision = req.body?.decision === 'apply' ? 'applied' : req.body?.decision === 'reject' ? 'rejected' : null;
  if (!decision) return res.status(400).json({ error: 'Choose to apply or reject.' });

  let fields = {};
  try { fields = JSON.parse(cr.fields); } catch { fields = {}; }

  if (decision === 'applied') {
    let profile = {};
    try { profile = member.profile ? JSON.parse(member.profile) : {}; } catch { profile = {}; }
    let newName = null;
    let newEmail = null;
    for (const [key, val] of Object.entries(fields)) {
      const requested = val && val.requested != null ? String(val.requested) : '';
      if (!requested) continue;
      if (key === 'full_name') newName = requested;
      else if (key === 'email') newEmail = requested;
      else profile[key] = requested;
    }
    await db.tx(async (t) => {
      if (newName) await t.run('UPDATE users SET full_name = $1 WHERE id = $2', [newName, member.id]);
      if (newEmail) await t.run('UPDATE users SET email = $1 WHERE id = $2', [newEmail, member.id]);
      await t.run('UPDATE users SET profile = $1 WHERE id = $2', [JSON.stringify(profile), member.id]);
      await t.run("UPDATE correction_requests SET status = 'applied', staff_note = $1, handled_by = $2, handled_at = now() WHERE id = $3",
        [String(req.body?.staff_note || '').slice(0, 500), req.user.id, cr.id]);
    });
  } else {
    await db.run("UPDATE correction_requests SET status = 'rejected', staff_note = $1, handled_by = $2, handled_at = now() WHERE id = $3",
      [String(req.body?.staff_note || '').slice(0, 500), req.user.id, cr.id]);
  }

  await record(req, decision === 'applied' ? 'correction.apply' : 'correction.reject', {
    targetType: 'member', targetId: member.id, branch: member.branch,
    summary: `${decision === 'applied' ? 'Applied' : 'Rejected'} correction for ${member.full_name} (${Object.keys(fields).join(', ')})`,
  });
  res.json({ ok: true, status: decision });
}));
