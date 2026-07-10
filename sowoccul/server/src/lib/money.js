/**
 * Money handling — one place, explicit rules.
 * ────────────────────────────────────────────────────────────────────────────
 * All amounts in this system are WHOLE Central African CFA francs (XAF/FCFA).
 * The franc has no commonly-used minor unit in practice, so we store and move
 * integer francs — no cents, no floats.
 *
 * Postgres stores balances as BIGINT. The `pg` driver returns BIGINT as a
 * STRING by default (to avoid silent precision loss), so every value crossing
 * the boundary must be parsed deliberately. This module is that boundary.
 *
 * We refuse to work with any amount outside the JS safe-integer range. A single
 * account holding more than 9,007,199,254,740,991 FCFA (~9 quadrillion) is not a
 * real scenario for this cooperative, so rejecting it is safe and means every
 * in-range arithmetic result is exact. If that ever changes, this is the one
 * file to revisit (switch to BigInt end-to-end).
 */

export const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * Parse a value coming FROM the database (string | number | bigint) into a safe
 * integer number of francs. Throws if it isn't a clean, in-range integer —
 * because a corrupted balance should stop the operation, not silently continue.
 */
export function fromDb(value) {
  if (value === null || value === undefined) {
    throw new MoneyError('Missing amount from database.');
  }
  let n;
  if (typeof value === 'bigint') {
    if (value > BigInt(MAX_SAFE_AMOUNT) || value < BigInt(-MAX_SAFE_AMOUNT)) {
      throw new MoneyError('Stored balance is outside the supported range.');
    }
    n = Number(value);
  } else if (typeof value === 'number') {
    n = value;
  } else {
    // string from BIGINT
    if (!/^-?\d+$/.test(String(value).trim())) {
      throw new MoneyError('Stored balance is not a whole number.');
    }
    n = Number(String(value).trim());
  }
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError('Stored balance is outside the safe integer range.');
  }
  return n;
}

/**
 * Validate/normalize an amount coming FROM a user (a deposit, transfer, etc.).
 * Must be a positive whole number of francs within range. Returns the integer
 * or throws MoneyError with a member-friendly message.
 */
export function fromUser(value, { allowZero = false, min = 1 } = {}) {
  // Reject empties up front so null/''/undefined don't coerce to 0.
  if (value === null || value === undefined ||
      (typeof value === 'string' && value.trim() === '')) {
    throw new MoneyError('Enter a valid amount.');
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) throw new MoneyError('Enter a valid amount.');
  if (!Number.isInteger(n)) throw new MoneyError('Amounts must be whole francs (no decimals).');
  if (!allowZero && n < min) throw new MoneyError(`Amount must be at least ${min} FCFA.`);
  if (allowZero && n < 0) throw new MoneyError('Amount cannot be negative.');
  if (!Number.isSafeInteger(n)) throw new MoneyError('That amount is too large to process.');
  return n;
}

/** Add two in-range franc amounts, guarding the result stays safe. */
export function add(a, b) {
  const r = a + b;
  if (!Number.isSafeInteger(r)) throw new MoneyError('Resulting balance is too large to process.');
  return r;
}

/** Subtract b from a, guarding the result stays safe. */
export function subtract(a, b) {
  const r = a - b;
  if (!Number.isSafeInteger(r)) throw new MoneyError('Resulting balance is out of range.');
  return r;
}

/** A domain error carrying a message safe to show a member. */
export class MoneyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MoneyError';
    this.userSafe = true;
  }
}
