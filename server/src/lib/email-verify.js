/**
 * Email verification at signup.
 *
 * Design (security-critical — see the choices baked in here):
 *  - The LINK token is 32 random bytes, hex-encoded — not guessable, not
 *    sequential. Safe to email as a URL.
 *  - The CODE is 6 digits for humans to type. Because 6 digits is only a million
 *    possibilities, it is protected by a hard attempt cap: after MAX_ATTEMPTS
 *    wrong guesses the row is burned and the member must request a new one.
 *  - We store only SHA-256 HASHES of the token and code, never the raw values,
 *    so a database leak yields nothing usable.
 *  - Everything expires after TTL_HOURS. Expired rows verify nothing.
 *  - Issuing a fresh verification invalidates any previous one for that user.
 *
 * The raw token and code are returned ONCE from issueVerification() so the
 * caller can email them; they are never retrievable again.
 */

import crypto from 'crypto';
import { db } from '../db/index.js';

export const TTL_HOURS = 24;
export const MAX_ATTEMPTS = 5;
export const CODE_LENGTH = 6;

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

/** A 6-digit numeric code, zero-padded, from a cryptographic source. */
export function generateCode() {
  // 0 .. 999999 uniformly using rejection-free modulo on a large random int.
  const n = crypto.randomInt(0, 10 ** CODE_LENGTH);
  return String(n).padStart(CODE_LENGTH, '0');
}

/** A long, unguessable link token. */
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create (or replace) the pending verification for a user. Returns the RAW
 * token and code for emailing — not stored in plaintext anywhere.
 */
export async function issueVerification(userId, email) {
  const token = generateToken();
  const code = generateCode();
  const expires = new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString();

  // One live verification per user: drop any earlier ones.
  await db.run('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
  await db.run(
    `INSERT INTO email_verifications (user_id, email, token_hash, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, email, sha256(token), sha256(code), expires]
  );
  return { token, code, expiresAt: expires };
}

// Result codes so callers/tests can branch precisely.
export const VERIFY = {
  OK: 'ok',
  NOT_FOUND: 'not_found',     // no pending verification (maybe already verified)
  EXPIRED: 'expired',
  LOCKED: 'locked',           // too many wrong code attempts
  BAD_CODE: 'bad_code',       // wrong code, attempts remain
  BAD_TOKEN: 'bad_token',     // wrong or unknown link token
};

async function loadLive(userId) {
  return db.one(
    `SELECT * FROM email_verifications WHERE user_id = $1 AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`,
    [userId]
  );
}

async function markVerified(row) {
  await db.run('UPDATE email_verifications SET consumed_at = now() WHERE id = $1', [row.id]);
  await db.run('UPDATE users SET email_verified = 1 WHERE id = $1', [row.user_id]);
}

/**
 * Verify by clicking the emailed LINK. Looks the token up by its hash (so a
 * lost/leaked token can't be reversed). Returns { result, userId? }.
 */
export async function verifyByToken(rawToken) {
  if (!rawToken) return { result: VERIFY.BAD_TOKEN };
  const row = await db.one(
    `SELECT * FROM email_verifications WHERE token_hash = $1 AND consumed_at IS NULL ORDER BY id DESC LIMIT 1`,
    [sha256(rawToken)]
  );
  if (!row) return { result: VERIFY.BAD_TOKEN };
  if (new Date(row.expires_at).getTime() < Date.now()) return { result: VERIFY.EXPIRED };
  await markVerified(row);
  return { result: VERIFY.OK, userId: row.user_id };
}

/**
 * Verify by typing the 6-digit CODE for a given user (identified by email).
 * Enforces expiry and the wrong-guess lockout. Returns { result, userId?,
 * attemptsLeft? }.
 */
export async function verifyByCode(email, rawCode) {
  const user = await db.one("SELECT id FROM users WHERE email = $1", [String(email || '').trim().toLowerCase()]);
  if (!user) return { result: VERIFY.NOT_FOUND };
  const row = await loadLive(user.id);
  if (!row) return { result: VERIFY.NOT_FOUND };
  if (new Date(row.expires_at).getTime() < Date.now()) return { result: VERIFY.EXPIRED };
  if (row.attempts >= MAX_ATTEMPTS) return { result: VERIFY.LOCKED };

  const ok = crypto.timingSafeEqual(
    Buffer.from(row.code_hash, 'hex'),
    Buffer.from(sha256(String(rawCode || '').trim()), 'hex')
  );
  if (!ok) {
    const attempts = row.attempts + 1;
    await db.run('UPDATE email_verifications SET attempts = $1 WHERE id = $2', [attempts, row.id]);
    if (attempts >= MAX_ATTEMPTS) return { result: VERIFY.LOCKED };
    return { result: VERIFY.BAD_CODE, attemptsLeft: MAX_ATTEMPTS - attempts };
  }
  await markVerified(row);
  return { result: VERIFY.OK, userId: user.id };
}

/** Is this user's email already verified? */
export async function isVerified(userId) {
  const u = await db.one('SELECT email_verified FROM users WHERE id = $1', [userId]);
  return !!(u && u.email_verified);
}

/**
 * Manually mark a user's email as verified (admin support action). Sets the
 * user flag and consumes any live verification row so nothing dangles. Use only
 * when an administrator has confirmed the person's identity another way and
 * email delivery isn't an option.
 */
export async function markVerifiedByAdmin(userId) {
  await db.run('UPDATE email_verifications SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL', [userId]);
  await db.run('UPDATE users SET email_verified = 1 WHERE id = $1', [userId]);
}
