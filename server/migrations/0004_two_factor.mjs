/**
 * 0004 — two-factor authentication (TOTP).
 *
 * Adds the 2FA secret and enabled flag to users, and a recovery_codes table for
 * one-time backup codes (stored hashed). Mirrors initSchema(), safe on fresh and
 * existing databases.
 */
export async function up(client) {
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_secret  TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      code_hash  TEXT NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);
  `);
}
