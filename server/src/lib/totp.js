/**
 * TOTP (time-based one-time passwords) — RFC 6238, dependency-free.
 * ────────────────────────────────────────────────────────────────────────────
 * This is the maths behind Google Authenticator / Authy codes. A shared secret
 * plus the current 30-second time step produces a 6-digit code; the server
 * derives the same code from the same secret and checks they match.
 *
 * We implement it directly with Node's crypto (HMAC-SHA1, the default TOTP
 * algorithm authenticator apps expect) rather than pulling in a library, so
 * there's no external dependency to audit and the behaviour is fully visible.
 *
 * Security notes:
 *   • Secrets are Base32 (what authenticator apps consume) and generated from a
 *     CSPRNG (crypto.randomBytes), never Math.random.
 *   • Verification allows ±1 time step by default to tolerate clock drift, and
 *     compares using a constant-time comparison to avoid timing leaks.
 *   • Recovery codes are random, shown once, and STORED HASHED (sha256) — the
 *     database never holds a usable recovery code, only its hash, exactly like a
 *     password. A used code is removed so it can't be replayed.
 */
import crypto from 'crypto';

// ── Base32 (RFC 4648, no padding) — the encoding authenticator apps use ──────
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // skip anything not in the alphabet
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new Base32 secret (default 20 bytes → 160 bits, RFC-recommended). */
export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Compute the TOTP code for a secret at a given time step (counter). */
function hotp(secretBuf, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The current TOTP code for a Base32 secret (mainly for tests/QR preview). */
export function totp(secretBase32, { time = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Math.floor(time / 1000 / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Verify a user-supplied code against a secret, allowing ±window steps of drift.
 * Returns true/false. Constant-time-ish: we check each candidate and OR the
 * result without early-return on match.
 */
export function verifyTotp(secretBase32, token, { time = Date.now(), step = 30, digits = 6, window = 1 } = {}) {
  if (!secretBase32 || !token) return false;
  const clean = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const secretBuf = base32Decode(secretBase32);
  const counter = Math.floor(time / 1000 / step);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const candidate = hotp(secretBuf, counter + w, digits);
    // constant-time compare of equal-length 6-char strings
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) ok = true;
  }
  return ok;
}

/** Build the otpauth:// URI an authenticator app scans from a QR code. */
export function otpauthUri({ secret, label, issuer = 'SOWOCCUL' }) {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(label)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Recovery codes ───────────────────────────────────────────────────────────

/** Generate N human-friendly recovery codes (e.g. "4F2A-9C71-8E3D"). */
export function generateRecoveryCodes(n = 10) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 hex chars
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }
  return codes;
}

/** Hash a recovery code for storage (normalise case/dashes first). */
export function hashRecoveryCode(code) {
  const norm = String(code).toUpperCase().replace(/[^0-9A-F]/g, '');
  return crypto.createHash('sha256').update(norm).digest('hex');
}
