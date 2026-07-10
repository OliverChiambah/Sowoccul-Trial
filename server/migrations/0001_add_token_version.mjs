/**
 * 0001 — add users.token_version for session revocation.
 *
 * This mirrors the column initSchema() also ensures, so it's safe to run on both
 * fresh and existing databases. It exists to seed the migrations table with a
 * real, ordered first entry and to serve as the template for future changes:
 * copy this file, bump the number, describe the change, write the up().
 */
export async function up(client) {
  await client.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
  `);
}
