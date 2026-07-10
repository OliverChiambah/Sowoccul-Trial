/**
 * App settings — small, admin-editable configuration held in the database.
 * ────────────────────────────────────────────────────────────────────────────
 * Right now this holds the maker-checker approval threshold: the amount at or
 * above which a staff-posted account entry must be approved by a second person
 * before any money moves. Keeping it in the database (not an env var or a
 * constant) means an admin can tune it from the app without a redeploy.
 */
import { db } from '../db/index.js';

// Fallback used until an admin sets one. 500,000 FCFA is a sensible default for
// a microfinance cooperative — routine deposits pass through, large movements
// get a second pair of eyes. Change it in Admin → Settings.
export const DEFAULT_APPROVAL_THRESHOLD = 500000;

/** Read the current approval threshold (whole FCFA). Never throws; falls back. */
export async function getApprovalThreshold() {
  try {
    const row = await db.one("SELECT value FROM app_settings WHERE key = 'approval_threshold'");
    if (!row) return DEFAULT_APPROVAL_THRESHOLD;
    const n = Number(row.value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_APPROVAL_THRESHOLD;
  } catch {
    return DEFAULT_APPROVAL_THRESHOLD;
  }
}

/** Set the approval threshold (admin only — the route enforces that). */
export async function setApprovalThreshold(amount, actorId) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n < 0) throw new Error('Threshold must be a whole number of FCFA, zero or more.');
  await db.run(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ('approval_threshold', $1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
    [String(n), actorId ?? null]
  );
  return n;
}

// ── 2FA requirement ──────────────────────────────────────────────────────────
// Levels: 'off'   → nobody is forced (2FA stays optional)
//         'staff' → staff and admin must have 2FA
//         'all'   → staff, admin and members must have 2FA (members via a grace
//                   prompt rather than a hard forced-enrolment, decided in the UI)
export const REQUIRE_2FA_LEVELS = ['off', 'staff', 'all'];
export const DEFAULT_REQUIRE_2FA = 'off';

// When the requirement is raised to a level that covers members ('all'), members
// get this many days before they are forced to enrol. Until then they can log in
// and are shown a countdown reminder. Staff/admin are never on a grace period.
export const MEMBER_GRACE_DAYS = 10;

/** Read the current 2FA requirement level. Never throws; falls back to 'off'. */
export async function getRequire2fa() {
  try {
    const row = await db.one("SELECT value FROM app_settings WHERE key = 'require_2fa'");
    if (!row) return DEFAULT_REQUIRE_2FA;
    return REQUIRE_2FA_LEVELS.includes(row.value) ? row.value : DEFAULT_REQUIRE_2FA;
  } catch {
    return DEFAULT_REQUIRE_2FA;
  }
}

/** When was the member grace period started (ISO string), or null if not set. */
export async function getMemberGraceStart() {
  try {
    const row = await db.one("SELECT value FROM app_settings WHERE key = 'require_2fa_member_since'");
    return row ? row.value : null;
  } catch {
    return null;
  }
}

/** Set the 2FA requirement level (admin only — the route enforces that). */
export async function setRequire2fa(level, actorId) {
  if (!REQUIRE_2FA_LEVELS.includes(level)) throw new Error('Invalid 2FA requirement level.');
  await db.run(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ('require_2fa', $1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
    [level, actorId ?? null]
  );
  // Stamp the member grace start the first time we move to 'all', and clear it
  // when members are no longer covered — so the 10-day clock restarts cleanly if
  // the requirement is turned off and on again.
  if (level === 'all') {
    const existing = await getMemberGraceStart();
    if (!existing) {
      await db.run(
        `INSERT INTO app_settings (key, value, updated_by, updated_at)
         VALUES ('require_2fa_member_since', $1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_by = $2, updated_at = now()`,
        [new Date().toISOString(), actorId ?? null]
      );
    }
  } else {
    await db.run("DELETE FROM app_settings WHERE key = 'require_2fa_member_since'");
  }
  return level;
}

/**
 * Member grace status: how many whole days remain, and whether it has expired.
 * Returns { active, days_remaining, expired, since } where `active` means members
 * are currently under the requirement at all.
 */
export function memberGraceStatus(level, since, now = Date.now()) {
  if (level !== 'all' || !since) return { active: false, days_remaining: null, expired: false, since: null };
  const start = new Date(since).getTime();
  const elapsedDays = (now - start) / (1000 * 60 * 60 * 24);
  const remaining = Math.max(0, Math.ceil(MEMBER_GRACE_DAYS - elapsedDays));
  return { active: true, days_remaining: remaining, expired: elapsedDays >= MEMBER_GRACE_DAYS, since };
}

/**
 * Given a user's role and the requirement level, does this user MUST have 2FA?
 * (Members under 'all' are handled as a soft grace prompt in the client, so this
 * returns true for them too — the client decides hard-force vs. prompt.)
 */
export function twofaRequiredForRole(role, level) {
  if (level === 'off') return false;
  if (level === 'staff') return role === 'admin' || role === 'manager' || role === 'staff';
  if (level === 'all') return true;
  return false;
}

/** Whether a role is hard-forced (blocked until enrolled) vs. softly prompted.
 *  Staff/admin/manager are always hard-forced when required. Members are soft
 *  during the grace period, then hard-forced once it has expired. */
export function twofaHardForced(role, level, graceExpired = false) {
  if (!twofaRequiredForRole(role, level)) return false;
  if (role === 'admin' || role === 'manager' || role === 'staff') return true;
  // members: forced only after the grace window has passed
  return role === 'member' && level === 'all' && graceExpired === true;
}
