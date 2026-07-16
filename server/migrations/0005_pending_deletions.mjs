/**
 * 0005 — deletion approvals (dual control for removing users).
 *
 * The IT administrator can REQUEST removal of any user (member, staff, or
 * manager), but the account is only deleted once the General Manager approves.
 * pending_deletions holds those requests. A 'pending' row changes nothing; the
 * user is removed only on approval. This mirrors what initSchema() creates, so
 * it is safe on fresh and existing databases alike.
 */
export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pending_deletions (
      id               INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      target_id        INTEGER NOT NULL REFERENCES users(id),
      target_name      TEXT,
      target_role      TEXT,
      target_branch    TEXT,
      reason           TEXT,
      status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
      requested_by     INTEGER NOT NULL REFERENCES users(id),
      requested_by_name TEXT,
      decided_by       INTEGER REFERENCES users(id),
      decided_by_name  TEXT,
      decision_note    TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at       TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_pending_del_status ON pending_deletions(status);
  `);
}
