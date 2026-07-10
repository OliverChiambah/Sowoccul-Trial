import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { signToken, requireAuth, revokeSessions, signTwofaChallenge, verifyTwofaChallenge } from '../middleware/auth.js';
import { recordFor } from '../lib/audit.js';
import { ah } from '../lib/async-handler.js';
import { validateBody, v } from '../lib/validate.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { verifyTotp, hashRecoveryCode } from '../lib/totp.js';
import { getRequire2fa, getMemberGraceStart, memberGraceStatus, twofaRequiredForRole, twofaHardForced } from '../lib/settings.js';
import { branchNames, headquarters, listBranches } from '../lib/branches.js';
import { issueVerification, verifyByToken, verifyByCode, isVerified, VERIFY, TTL_HOURS, MAX_ATTEMPTS } from '../lib/email-verify.js';
import { notify } from '../lib/notify.js';

/** The user fields safe to return to the client after login. */
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    branch: user.branch,
    title: user.title || null,
    can_edit: user.can_edit ? 1 : 0,
    must_change_password: user.must_change_password ? 1 : 0,
    twofa_enabled: user.twofa_enabled ? 1 : 0,
  };
}

/**
 * Work out whether this user must (or should) set up 2FA, given the institution
 * requirement level. Returns flags the client uses to force enrolment (staff) or
 * prompt with a grace period (members).
 */
async function twofaSetupState(user) {
  if (user.twofa_enabled) return { twofa_setup_required: 0, twofa_setup_forced: 0, twofa_grace_days: null };
  const level = await getRequire2fa();
  const since = await getMemberGraceStart();
  const grace = memberGraceStatus(level, since);
  const required = twofaRequiredForRole(user.role, level);
  const forced = twofaHardForced(user.role, level, grace.expired);
  return {
    twofa_setup_required: required ? 1 : 0,
    twofa_setup_forced: forced ? 1 : 0,
    // For members under 'all': days left in the grace window (0 once expired).
    twofa_grace_days: user.role === 'member' && grace.active ? grace.days_remaining : null,
  };
}

export const authRouter = Router();

// Brute-force protection: max 10 login attempts per IP+username per 15 min.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyBy: 'username', name: 'login' });
// Registration is abusable (spam accounts) — limit per IP.
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, name: 'register' });
// Verifying a code is guessing-sensitive; limit attempts per IP as a second
// layer on top of the per-record attempt lockout. Resend is limited to stop
// someone spamming a victim's inbox.
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, name: 'verify-email' });
const resendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'verify-resend' });

// A minimal email format check. Real email verification (a confirmation link)
// would be added before production; for now this catches obvious mistakes.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/auth/login  { username, password } */
authRouter.post('/login', loginLimiter, validateBody({
  username: v.string().trim().lower().min(1).max(120),
  password: v.string().min(1).max(200),
}), ah(async (req, res) => {
  const { username, password } = req.body;

  const user = await db.one('SELECT * FROM users WHERE username = $1', [username]);

  // Same message whether the user exists or not, to avoid leaking accounts.
  const invalid = () =>
    res.status(401).json({ error: 'Username or password is incorrect.' });

  if (!user) return invalid();
  if (!bcrypt.compareSync(password, user.password_hash)) return invalid();

  // Members must have confirmed their email before they can sign in. Staff and
  // admin accounts are created internally and are exempt.
  if (user.role === 'member' && !user.email_verified) {
    return res.status(403).json({
      error: 'Please confirm your email address first. Check your inbox for the verification link and code.',
      code: 'email_unverified',
      email: user.email,
    });
  }

  // If this account has 2FA enabled, the password alone is not enough. Issue a
  // short-lived challenge token; the client must complete /login/2fa with a code.
  if (user.twofa_enabled) {
    return res.json({
      twofa_required: true,
      challenge: signTwofaChallenge(user.id),
    });
  }

  const token = signToken(user);
  await recordFor(user, 'auth.login', { summary: `${user.full_name} signed in` });
  res.json({ token, user: { ...publicUser(user), ...(await twofaSetupState(user)) } });
}));

/** POST /api/auth/login/2fa  { challenge, code } — complete a 2FA login.
 *  `code` may be a 6-digit TOTP code or a one-time recovery code. */
authRouter.post('/login/2fa', loginLimiter, ah(async (req, res) => {
  const challenge = String(req.body?.challenge || '');
  const code = String(req.body?.code || '').trim();
  const userId = verifyTwofaChallenge(challenge);
  if (!userId) return res.status(401).json({ error: 'Your sign-in attempt expired. Please start again.' });

  const user = await db.one('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user || !user.twofa_enabled) return res.status(401).json({ error: 'Two-factor authentication is not active for this account.' });

  let ok = verifyTotp(user.twofa_secret, code);
  let usedRecovery = false;

  // If the TOTP code didn't match, try it as a one-time recovery code.
  if (!ok && code) {
    const hash = hashRecoveryCode(code);
    const rc = await db.one('SELECT id FROM recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL', [user.id, hash]);
    if (rc) {
      await db.run('UPDATE recovery_codes SET used_at = now() WHERE id = $1', [rc.id]);
      ok = true;
      usedRecovery = true;
    }
  }

  if (!ok) return res.status(401).json({ error: 'That code is not correct. Try again, or use a recovery code.' });

  const token = signToken(user);
  await recordFor(user, 'auth.login', { summary: `${user.full_name} signed in${usedRecovery ? ' (using a recovery code)' : ' with 2FA'}` });
  if (usedRecovery) {
    await recordFor(user, 'twofa.recovery_used', { summary: `${user.full_name} used a 2FA recovery code to sign in` });
  }
  res.json({ token, user: { ...publicUser(user), ...(await twofaSetupState(user)) }, used_recovery: usedRecovery });
}));

/** POST /api/auth/logout-everywhere — ends all of the user's sessions,
 *  including this one. The client should discard its token afterward. */
authRouter.post('/logout-everywhere', requireAuth, ah(async (req, res) => {
  await revokeSessions(req.user.id);
  res.json({ ok: true });
}));

/** GET /api/auth/me  — returns the signed-in user's profile. */
authRouter.get('/me', requireAuth, ah(async (req, res) => {
  const user = await db.one(
    'SELECT id, username, full_name, email, phone, role, branch, title, can_edit, must_change_password, twofa_enabled FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: { ...user, ...(await twofaSetupState(user)) } });
}));

/**
 * POST /api/auth/change-password  { current_password, new_password }
 * Any signed-in user can change their own password. Clears the
 * must_change_password flag (used for admin-created staff on first login).
 */
authRouter.post('/change-password', requireAuth, validateBody({
  current_password: v.string().min(1),
  new_password: v.string().min(8).max(200),
}), ah(async (req, res) => {
  const currentPassword = req.body.current_password;
  const newPassword = req.body.new_password;
  const user = await db.one('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }
  if (bcrypt.compareSync(newPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Please choose a password different from your current one.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.run('UPDATE users SET password_hash = $1, must_change_password = 0 WHERE id = $2', [hash, user.id]);
  // Changing a password ends all OTHER sessions (a stolen/old token stops
  // working). We then re-issue a token for THIS session so the user isn't
  // kicked out of the browser they just changed it in.
  const newVersion = await revokeSessions(user.id);
  const fresh = await db.one('SELECT * FROM users WHERE id = $1', [user.id]);
  const token = signToken({ ...fresh, token_version: newVersion });
  await recordFor(user, 'auth.password_change', { summary: `${user.full_name} changed their password` });
  res.json({ ok: true, token });
}));

/** GET /api/auth/branches — public list of branches for the registration form. */
authRouter.get('/branches', ah(async (req, res) => {
  res.json({ branches: await branchNames(), headquarters: await headquarters(), details: await listBranches() });
}));

/**
 * POST /api/auth/register — public "Become a member" registration.
 * The email is used as the username. The password is hashed with bcrypt.
 * The account is created active but flagged pending_review for staff.
 * Body: { email, password, confirm_password, applicant_type, ...profileFields }
 */
authRouter.post('/register', registerLimiter, ah(async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const confirm = String(body.confirm_password || '');
  const applicantType = body.applicant_type === 'business' ? 'business' : 'individual';

  // --- validation ---
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address. It will be your username.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (password !== confirm) {
    return res.status(400).json({ error: 'The two passwords do not match.' });
  }

  // The member must choose the branch closest to them (handles their account).
  const branch = String(body.branch || '').trim();
  if (!(await branchNames()).includes(branch)) {
    return res.status(400).json({ error: 'Choose the branch closest to you.' });
  }

  // A display name: individual uses surname + given names; business uses the company name.
  const fullName = applicantType === 'business'
    ? String(body.company_name || '').trim()
    : `${String(body.surname || '').trim()} ${String(body.given_names || '').trim()}`.trim();

  if (!fullName) {
    return res.status(400).json({
      error: applicantType === 'business'
        ? 'Enter the company name.'
        : 'Enter the surname and given names.',
    });
  }

  // Email (username) must be unique.
  const existing = await db.one('SELECT 1 FROM users WHERE username = $1 OR email = $2', [email, email]);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Store the whole submitted form (minus the passwords) as the profile.
  const { password: _pw, confirm_password: _cpw, ...profileFields } = body;
  const profile = JSON.stringify(profileFields);
  const phone = String(body.phone || body.tel || '').trim() || null;

  const passwordHash = bcrypt.hashSync(password, 10);

  const inserted = await db.one(`
    INSERT INTO users (username, password_hash, full_name, email, phone, role, review_status, applicant_type, branch, profile)
    VALUES ($1, $2, $3, $4, $5, 'member', 'pending_review', $6, $7, $8)
    RETURNING id
  `, [email, passwordHash, fullName, email, phone, applicantType, branch, profile]);

  // Email verification: issue a link token + 6-digit code, email both, and do
  // NOT log the member in. They must confirm their email before they can sign in.
  const { token, code } = await issueVerification(inserted.id, email);
  const base = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  const link = `${base || ''}/verify-email?token=${token}`;
  notify.verifyEmail(inserted.id, {
    link, code, hours: TTL_HOURS,
    name: (fullName || '').split(' ')[0] || fullName,
  });

  res.status(201).json({
    ok: true,
    verification_required: true,
    email,
    message: 'Account created. Check your email for a verification link and code to activate your account.',
  });
}));

/**
 * POST /api/auth/verify-email/token  { token }
 * Confirm an email by the clicked link token. Returns a clear result the client
 * can act on (success, expired, or invalid).
 */
authRouter.post('/verify-email/token', verifyLimiter, ah(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Missing verification token.', code: VERIFY.BAD_TOKEN });
  const { result } = await verifyByToken(token);
  if (result === VERIFY.OK) return res.json({ ok: true, verified: true });
  if (result === VERIFY.EXPIRED) {
    return res.status(410).json({ error: 'This verification link has expired. Please request a new one.', code: VERIFY.EXPIRED });
  }
  return res.status(400).json({ error: 'This verification link is invalid or has already been used.', code: VERIFY.BAD_TOKEN });
}));

/**
 * POST /api/auth/verify-email/code  { email, code }
 * Confirm an email by the 6-digit code. Enforces the per-record attempt lockout
 * (returns attemptsLeft so the UI can warn the member before they're locked out).
 */
authRouter.post('/verify-email/code', verifyLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const code = String(req.body?.code || '').trim();
  if (!email || !code) return res.status(400).json({ error: 'Enter your email and the 6-digit code.', code: VERIFY.BAD_CODE });

  const { result, attemptsLeft } = await verifyByCode(email, code);
  if (result === VERIFY.OK) return res.json({ ok: true, verified: true });
  if (result === VERIFY.EXPIRED) {
    return res.status(410).json({ error: 'This code has expired. Please request a new one.', code: VERIFY.EXPIRED });
  }
  if (result === VERIFY.LOCKED) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.', code: VERIFY.LOCKED });
  }
  if (result === VERIFY.NOT_FOUND) {
    // Don't reveal whether the email exists; generic message.
    return res.status(400).json({ error: 'That code is not correct.', code: VERIFY.BAD_CODE });
  }
  // BAD_CODE with attempts remaining.
  return res.status(400).json({
    error: 'That code is not correct.',
    code: VERIFY.BAD_CODE,
    attempts_left: attemptsLeft,
  });
}));

/**
 * POST /api/auth/verify-email/resend  { email }
 * Re-issue and re-send a verification email. Deliberately returns the SAME
 * response whether or not the email matches an unverified account, so it can't
 * be used to discover which emails are registered. Rate-limited.
 */
authRouter.post('/verify-email/resend', resendLimiter, ah(async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const generic = { ok: true, message: 'If that email needs verification, we have sent a new link and code.' };
  if (!email) return res.json(generic);

  const user = await db.one(
    "SELECT id, full_name, email, email_verified FROM users WHERE lower(email) = lower($1) AND role = 'member'",
    [email]
  );
  // Only re-issue for a real, still-unverified member. Otherwise fall through to
  // the same generic response.
  if (user && !user.email_verified) {
    const { token, code } = await issueVerification(user.id, user.email);
    const base = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '');
    const link = `${base || ''}/verify-email?token=${token}`;
    notify.verifyEmail(user.id, {
      link, code, hours: TTL_HOURS,
      name: (user.full_name || '').split(' ')[0] || user.full_name,
    });
  }
  return res.json(generic);
}));
