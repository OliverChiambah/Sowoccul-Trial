import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { canViewBranch as _canViewBranch, canEditBranch as _canEditBranch } from '../lib/permissions.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-to-a-long-random-secret';

/** Signs a session token for a user. Carries branch + can_edit for authz. */
export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.full_name,
      branch: user.branch,
      title: user.title || null,
      can_edit: user.can_edit ? 1 : 0,
      mcp: user.must_change_password ? 1 : 0,
      tv: user.token_version || 0,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

/** Requires a valid token; attaches req.user. Also enforces token-version so a
 *  revoked session (password change, forced logout, staff removal) is rejected
 *  even though its JWT hasn't expired yet. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'You need to sign in to do that.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  try {
    // Source of truth for revocation: the user's current token_version. If the
    // token's tv is behind the database, every token issued before the bump is
    // now invalid. One indexed primary-key lookup per request.
    const row = await db.one(
      'SELECT token_version, role, branch, can_edit, title, must_change_password, review_status FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!row) {
      return res.status(401).json({ error: 'Your account is no longer active.' });
    }
    if ((payload.tv || 0) !== (row.token_version || 0)) {
      return res.status(401).json({ error: 'Your session has ended. Please sign in again.', code: 'session_revoked' });
    }
    // Use the FRESH db values for authz fields so a rights change takes effect
    // immediately without re-login (name stays from token — cosmetic only).
    req.user = {
      id: payload.sub,
      role: row.role,
      name: payload.name,
      branch: row.branch || null,
      title: row.title || null,
      can_edit: row.can_edit ? 1 : 0,
      must_change_password: row.must_change_password ? 1 : 0,
      review_status: row.review_status || 'active',
    };
    next();
  } catch (e) {
    next(e);
  }
}

/** Requires the user to have one of the given roles. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have access to this area." });
    }
    next();
  };
}

/**
 * Blocks a staff/manager who still has a temporary password from taking any
 * action until they've set their own. Checks the database (source of truth) so
 * a stale token can't bypass it, and a fresh change takes effect immediately.
 * They can still call /api/auth/change-password (not behind this guard).
 */
export async function requirePasswordChanged(req, res, next) {
  if (!req.user) return next();
  try {
    const row = await db.one('SELECT must_change_password FROM users WHERE id = $1', [req.user.id]);
    if (row && row.must_change_password) {
      return res.status(403).json({ error: 'Please set a new password before continuing.', code: 'must_change_password' });
    }
    next();
  } catch (e) { next(e); }
}

/* ── Authorization helpers (branch scoping + edit rights) ─────────────────── */

/** A short-lived token that ONLY authorises completing the 2FA step at login.
 *  It cannot be used as a session token (different purpose claim), so a stolen
 *  challenge token can't act on the account without the 2FA code. */
export function signTwofaChallenge(userId) {
  return jwt.sign({ sub: userId, purpose: '2fa_challenge' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyTwofaChallenge(token) {
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.purpose !== '2fa_challenge') return null;
    return p.sub;
  } catch {
    return null;
  }
}

/** Invalidate every existing session for a user by bumping their token_version.
 *  Call after a password change, a forced logout, or removing a staff account.
 *  Returns the new token_version so the caller can re-issue a fresh token. */
export async function revokeSessions(userId) {
  const row = await db.one(
    'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
    [userId]
  );
  return row ? row.token_version : null;
}

/** admin and manager act everywhere; staff only within their own branch. */
export function canViewBranch(user, branchName) {
  // Delegates to the pure policy module (lib/permissions.js).
  return _canViewBranch(user, branchName);
}

/**
 * May this user ALTER a member in the given branch?
 *  - admin / manager: yes, any branch
 *  - staff: only their own branch AND only if they hold edit rights
 *  - otherwise: no
 */
export function canEditBranch(user, branchName) {
  return _canEditBranch(user, branchName);
}

/** Loads a member row (id) or returns null. */
export async function loadMember(id) {
  return (await db.one('SELECT id, full_name, branch, role FROM users WHERE id = $1', [id])) || null;
}

/**
 * Express guard: blocks the IT administrator from member financial data and
 * money operations. The system admin is technical-only — separated from the
 * running of member money. Other roles pass through; their own branch/edit
 * checks still apply downstream.
 */
export function blockFinancialAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return res.status(403).json({
      error: 'The system administrator role is for technical administration only and cannot access member financial data or transactions.',
      code: 'admin_not_financial',
    });
  }
  next();
}

/**
 * Express guard: blocks a member who is still awaiting branch-manager admission
 * (review_status 'pending_review') from money-moving actions. They can sign in
 * and look around, but can't transact until a manager admits them. Non-members
 * and admitted members pass through untouched.
 */
export function blockPendingMember(req, res, next) {
  if (req.user && req.user.role === 'member' && req.user.review_status === 'pending_review') {
    return res.status(403).json({
      error: 'Your account is still being reviewed by your branch. You will be able to use this once a manager admits you.',
      code: 'member_pending_review',
    });
  }
  next();
}

/**
 * Express guard factory: ensures the actor may EDIT the member named in a
 * route param (default :id). Attaches req.member. Returns 403/404 as needed.
 */
export function requireEditMember(param = 'id') {
  return async (req, res, next) => {
    try {
      const member = await loadMember(parseInt(req.params[param], 10));
      if (!member) return res.status(404).json({ error: 'Member not found.' });
      if (!canEditBranch(req.user, member.branch)) {
        return res.status(403).json({ error: 'You can only edit members in your own branch, and you need edit rights to do so.' });
      }
      req.member = member;
      next();
    } catch (e) { next(e); }
  };
}
