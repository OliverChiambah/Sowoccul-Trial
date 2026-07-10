import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { record } from '../lib/audit.js';
import { ah } from '../lib/async-handler.js';
import { generateSecret, otpauthUri, verifyTotp, generateRecoveryCodes, hashRecoveryCode } from '../lib/totp.js';

// Member-facing self-service: see my data, edit my own contact details, and
// request corrections to KYC fields that staff must review.
export const meRouter = Router();
meRouter.use(requireAuth);

// Fields a member may change themselves (low-risk contact details only).
const SELF_EDITABLE = ['phone'];
// Fields that need staff review (identity / KYC). Shown on the data page.
const REVIEWABLE = ['full_name', 'email', 'cni_number', 'niu', 'residential_address', 'employer', 'profession'];

/** GET /api/me — everything we hold about the signed-in member. */
meRouter.get('/', ah(async (req, res) => {
  const user = await db.one('SELECT id, username, full_name, email, phone, role, branch, applicant_type, profile, notify_email, created_at FROM users WHERE id = $1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  let profile = null;
  try { profile = user.profile ? JSON.parse(user.profile) : null; } catch { profile = null; }
  const accounts = await db.all('SELECT account_number, type, balance, currency, status, created_at FROM accounts WHERE user_id = $1 ORDER BY id', [user.id]);
  const pending = (await db.all("SELECT id, fields, note, status, created_at FROM correction_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 20", [user.id]))
    .map((r) => { try { r.fields = JSON.parse(r.fields); } catch { r.fields = {}; } return r; });
  delete user.profile;
  res.json({ user: { ...user, profile }, accounts, corrections: pending, self_editable: SELF_EDITABLE, reviewable: REVIEWABLE });
}));

/** PATCH /api/me/contact  { phone } — member updates their own phone directly. */
meRouter.patch('/contact', ah(async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'Enter a phone number.' });
  if (phone.length > 40) return res.status(400).json({ error: 'That phone number is too long.' });
  await db.run('UPDATE users SET phone = $1 WHERE id = $2', [phone, req.user.id]);
  await record(req, 'member.self_update', {
    targetType: 'member', targetId: req.user.id, branch: req.user.branch,
    summary: `${req.user.name} updated their own phone number`,
  });
  res.json({ ok: true, phone });
}));

/** PATCH /api/me/notifications { email: boolean } — opt in/out of non-essential
 *  email notifications. Security emails are always sent regardless. */
meRouter.patch('/notifications', ah(async (req, res) => {
  const on = req.body?.email ? 1 : 0;
  await db.run('UPDATE users SET notify_email = $1 WHERE id = $2', [on, req.user.id]);
  res.json({ ok: true, notify_email: on });
}));

/**
 * POST /api/me/corrections  { fields: {field: requestedValue}, note }
 * Member requests corrections to reviewable KYC fields; staff apply or reject.
 */
meRouter.post('/corrections', ah(async (req, res) => {
  const body = req.body || {};
  const requested = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const user = await db.one('SELECT full_name, email, phone, profile FROM users WHERE id = $1', [req.user.id]);
  let profile = {};
  try { profile = user.profile ? JSON.parse(user.profile) : {}; } catch { profile = {}; }

  // Build a {field: {current, requested}} map, only for allowed reviewable fields.
  const fields = {};
  for (const key of REVIEWABLE) {
    if (requested[key] == null) continue;
    const value = String(requested[key]).trim();
    if (!value) continue;
    let current = '';
    if (key === 'full_name') current = user.full_name || '';
    else if (key === 'email') current = user.email || '';
    else current = profile[key] != null ? String(profile[key]) : '';
    if (value === current) continue; // no change requested
    fields[key] = { current, requested: value };
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'Enter at least one changed value to request a correction.' });
  }

  const inserted = await db.one(`
    INSERT INTO correction_requests (user_id, fields, note, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING id
  `, [req.user.id, JSON.stringify(fields), String(body.note || '').slice(0, 500)]);

  await record(req, 'correction.request', {
    targetType: 'member', targetId: req.user.id, branch: req.user.branch,
    summary: `${req.user.name} requested a correction to: ${Object.keys(fields).join(', ')}`,
  });
  res.status(201).json({ ok: true, id: inserted.id });
}));

// ── Two-factor authentication (TOTP) — self-service ──────────────────────────
// Any signed-in user may enrol in 2FA. Staff/admin are the priority, but members
// can opt in too. Enrolment is two steps: begin (get a secret + QR), then
// confirm (prove a code works) which enables it and returns one-time recovery
// codes. Disabling requires a current code, so a walk-up attacker on an unlocked
// session can't simply switch it off.

/** GET /api/me/2fa — current 2FA status for the signed-in user. */
meRouter.get('/2fa', ah(async (req, res) => {
  const u = await db.one('SELECT twofa_enabled FROM users WHERE id = $1', [req.user.id]);
  const remaining = await db.one(
    'SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL',
    [req.user.id]
  );
  res.json({ enabled: !!(u && u.twofa_enabled), recovery_codes_remaining: remaining ? remaining.n : 0 });
}));

/** POST /api/me/2fa/begin — generate a secret and the otpauth URI to scan.
 *  Does NOT enable 2FA yet; the secret is stored provisionally until confirmed. */
meRouter.post('/2fa/begin', ah(async (req, res) => {
  const u = await db.one('SELECT username, email, twofa_enabled FROM users WHERE id = $1', [req.user.id]);
  if (u && u.twofa_enabled) return res.status(409).json({ error: 'Two-factor authentication is already on. Turn it off first if you want to re-enrol.' });
  const secret = generateSecret();
  // Store provisionally; twofa_enabled stays 0 until /confirm succeeds.
  await db.run('UPDATE users SET twofa_secret = $1 WHERE id = $2', [secret, req.user.id]);
  const label = (u && (u.email || u.username)) || `user-${req.user.id}`;
  res.json({ secret, otpauth: otpauthUri({ secret, label }) });
}));

/** POST /api/me/2fa/confirm { code } — verify a code, enable 2FA, return recovery codes. */
meRouter.post('/2fa/confirm', ah(async (req, res) => {
  const code = String(req.body?.code || '').trim();
  const u = await db.one('SELECT twofa_secret, twofa_enabled, full_name FROM users WHERE id = $1', [req.user.id]);
  if (!u || !u.twofa_secret) return res.status(400).json({ error: 'Start the setup first.' });
  if (u.twofa_enabled) return res.status(409).json({ error: 'Two-factor authentication is already on.' });
  if (!verifyTotp(u.twofa_secret, code)) {
    return res.status(400).json({ error: 'That code is not correct. Check your authenticator app and try again.' });
  }

  // Enable, and generate a fresh set of one-time recovery codes (stored hashed).
  const codes = generateRecoveryCodes(10);
  await db.tx(async (t) => {
    await t.run('UPDATE users SET twofa_enabled = 1 WHERE id = $1', [req.user.id]);
    await t.run('DELETE FROM recovery_codes WHERE user_id = $1', [req.user.id]);
    for (const c of codes) {
      await t.run('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)', [req.user.id, hashRecoveryCode(c)]);
    }
  });
  await record(req, 'twofa.enabled', { targetType: 'user', targetId: req.user.id, summary: `${u.full_name} turned on two-factor authentication` });
  // Recovery codes are shown ONCE, here. They are not retrievable later.
  res.json({ ok: true, recovery_codes: codes });
}));

/** POST /api/me/2fa/disable { code } — turn 2FA off (needs a current code or recovery code). */
meRouter.post('/2fa/disable', ah(async (req, res) => {
  const code = String(req.body?.code || '').trim();
  const u = await db.one('SELECT twofa_secret, twofa_enabled, full_name FROM users WHERE id = $1', [req.user.id]);
  if (!u || !u.twofa_enabled) return res.status(400).json({ error: 'Two-factor authentication is not on.' });

  let ok = verifyTotp(u.twofa_secret, code);
  if (!ok && code) {
    const rc = await db.one('SELECT id FROM recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL', [req.user.id, hashRecoveryCode(code)]);
    if (rc) ok = true;
  }
  if (!ok) return res.status(400).json({ error: 'Enter a current code from your app (or a recovery code) to turn 2FA off.' });

  await db.tx(async (t) => {
    await t.run('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = $1', [req.user.id]);
    await t.run('DELETE FROM recovery_codes WHERE user_id = $1', [req.user.id]);
  });
  await record(req, 'twofa.disabled', { targetType: 'user', targetId: req.user.id, summary: `${u.full_name} turned off two-factor authentication` });
  res.json({ ok: true });
}));

/** POST /api/me/2fa/recovery-codes { code } — regenerate recovery codes (needs a current code). */
meRouter.post('/2fa/recovery-codes', ah(async (req, res) => {
  const code = String(req.body?.code || '').trim();
  const u = await db.one('SELECT twofa_secret, twofa_enabled FROM users WHERE id = $1', [req.user.id]);
  if (!u || !u.twofa_enabled) return res.status(400).json({ error: 'Two-factor authentication is not on.' });
  if (!verifyTotp(u.twofa_secret, code)) return res.status(400).json({ error: 'Enter a current code from your app first.' });

  const codes = generateRecoveryCodes(10);
  await db.tx(async (t) => {
    await t.run('DELETE FROM recovery_codes WHERE user_id = $1', [req.user.id]);
    for (const c of codes) {
      await t.run('INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)', [req.user.id, hashRecoveryCode(c)]);
    }
  });
  await record(req, 'twofa.recovery_regenerated', { targetType: 'user', targetId: req.user.id, summary: `New 2FA recovery codes generated` });
  res.json({ ok: true, recovery_codes: codes });
}));
