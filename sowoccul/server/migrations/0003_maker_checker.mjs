/**
 * 0003 — maker-checker (dual approval) for large account entries.
 *
 * pending_entries holds above-threshold staff-posted entries that are waiting
 * for a second person to approve before any money moves. app_settings holds the
 * admin-editable approval threshold. Both mirror what initSchema() creates, so
 * this is safe on fresh and existing databases alike.
 */
export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pending_entries (
      id             INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      account_id     INTEGER NOT NULL REFERENCES accounts(id),
      amount         BIGINT NOT NULL,
      kind           TEXT NOT NULL,
      description    TEXT,
      branch         TEXT,
      status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
      requested_by   INTEGER NOT NULL REFERENCES users(id),
      requested_by_name TEXT,
      decided_by     INTEGER REFERENCES users(id),
      decided_by_name TEXT,
      decision_note  TEXT,
      transaction_id INTEGER REFERENCES transactions(id),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at     TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_by  INTEGER,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_entries(status);
    CREATE INDEX IF NOT EXISTS idx_pending_branch ON pending_entries(branch);
  `);
}
