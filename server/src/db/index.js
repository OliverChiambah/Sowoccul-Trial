// The pg driver is imported lazily so this module can be imported in unit tests
// (and fail fast with a clear message in production) without the native package
// present. In normal operation `npm install` provides pg and everything below
// works exactly as before.
let pg = null;
try {
  pg = (await import('pg')).default;
} catch {
  pg = null; // resolved on first real DB use; unit tests that never hit the DB are fine
}

// ── Postgres connection pool ────────────────────────────────────────────────
// Configuration comes entirely from the environment (DATABASE_URL). On managed
// hosts like Render the URL is injected as a secret; locally it's in your shell
// or a .env used only for development. We never hard-code credentials.
//
// PGSSLMODE / DATABASE_SSL controls TLS to the database. Managed Postgres
// requires SSL; we enable it unless explicitly disabled for a local server.
const useSsl = (() => {
  const v = (process.env.DATABASE_SSL || '').toLowerCase();
  if (v === 'false' || v === 'disable' || v === '0') return false;
  if (v === 'true' || v === 'require' || v === '1') return { rejectUnauthorized: false };
  // Default: SSL on for anything that isn't an explicit localhost URL.
  const url = process.env.DATABASE_URL || '';
  return /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
})();

let _pool = null;

/** For tests only: inject a fake pool implementing { query, connect, end, on }. */
export function __setPoolForTests(fake) { _pool = fake; }

/** Lazily create (once) and return the connection pool. */
function getPool() {
  if (_pool) return _pool;
  if (!pg) {
    throw new Error(
      'The "pg" package is not installed. Run `npm install` in server/ before starting the API.'
    );
  }
  _pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  _pool.on('error', (err) => {
    console.error('Unexpected Postgres pool error:', err.message);
  });
  return _pool;
}

// Backwards-compatible `pool` accessor: existing code and scripts use `pool.query`,
// `pool.connect`, `pool.end`. A Proxy forwards these to the lazily-created pool.
export const pool = new Proxy({}, {
  get(_t, prop) {
    const p = getPool();
    const val = p[prop];
    return typeof val === 'function' ? val.bind(p) : val;
  },
});

/**
 * Small data-access layer. It intentionally mirrors the shape the codebase used
 * with better-sqlite3 so routes read almost identically — except everything is
 * async now:
 *
 *   const user = await db.one('SELECT * FROM users WHERE id = $1', [id]);
 *   const rows = await db.all('SELECT * FROM accounts WHERE user_id = $1', [id]);
 *   const res  = await db.run('UPDATE users SET phone = $1 WHERE id = $2', [p, id]);
 *   await db.tx(async (t) => { await t.run(...); await t.one(...); });
 *
 * Placeholders are Postgres-style ($1, $2, ...). A helper `sql` tag is provided
 * for building them, but most queries just write $1..$n directly.
 */
export const db = {
  /** Run a query, return the full pg result (rows, rowCount, ...). */
  async query(text, params = []) {
    return pool.query(text, params);
  },
  /** First row, or null. */
  async one(text, params = []) {
    const r = await pool.query(text, params);
    return r.rows[0] || null;
  },
  /** All rows. */
  async all(text, params = []) {
    const r = await pool.query(text, params);
    return r.rows;
  },
  /** Execute a statement; returns { rowCount, rows }. */
  async run(text, params = []) {
    const r = await pool.query(text, params);
    return { rowCount: r.rowCount, rows: r.rows };
  },
  /**
   * Run a function inside a single transaction on one pooled client. The
   * callback receives a client-bound helper with the same one/all/run methods.
   * Commits on success, rolls back on any thrown error, always releases.
   */
  async tx(fn) {
    const client = await pool.connect();
    const bound = {
      async query(text, params = []) { return client.query(text, params); },
      async one(text, params = []) { const r = await client.query(text, params); return r.rows[0] || null; },
      async all(text, params = []) { const r = await client.query(text, params); return r.rows; },
      async run(text, params = []) { const r = await client.query(text, params); return { rowCount: r.rowCount, rows: r.rows }; },
    };
    try {
      await client.query('BEGIN');
      const result = await fn(bound);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  },
};

// ── Schema ──────────────────────────────────────────────────────────────────
// Postgres-native DDL. Differences from the old SQLite schema:
//   • INTEGER PRIMARY KEY AUTOINCREMENT  → GENERATED ALWAYS AS IDENTITY
//   • boolean flags kept as INTEGER 0/1 to avoid touching app logic, but could
//     be BOOLEAN later; CHECK constraints preserved.
//   • created_at TEXT DEFAULT datetime('now') → TIMESTAMPTZ DEFAULT now()
//   • "CREATE TABLE IF NOT EXISTS" + "ADD COLUMN IF NOT EXISTS" make this
//     idempotent, so it doubles as the migration path (no PRAGMA needed).
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      email         TEXT UNIQUE,
      phone         TEXT,
      role          TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('member','staff','manager','admin')),
      can_edit      INTEGER NOT NULL DEFAULT 0,
      title         TEXT,
      employee_id   TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 0,
      twofa_secret TEXT,
      twofa_enabled INTEGER NOT NULL DEFAULT 0,
      staff_photo TEXT,
      bio TEXT,
      start_date TEXT,
      work_extension TEXT,
      languages TEXT,
      review_status TEXT NOT NULL DEFAULT 'active'
                    CHECK (review_status IN ('active','pending_review')),
      applicant_type TEXT NOT NULL DEFAULT 'individual',
      branch        TEXT NOT NULL DEFAULT 'Limbe',
      profile       TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id             INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      account_number TEXT UNIQUE NOT NULL,
      type           TEXT NOT NULL DEFAULT 'savings',
      balance        BIGINT NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'XAF',
      status         TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','frozen','closed')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      account_id   INTEGER NOT NULL REFERENCES accounts(id),
      amount       BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      kind         TEXT NOT NULL,
      description  TEXT,
      counterpart_account_id INTEGER REFERENCES accounts(id),
      created_by   INTEGER REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loan_applications (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      reference     TEXT UNIQUE NOT NULL,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      amount       BIGINT NOT NULL,
      purpose      TEXT,
      duration_months INTEGER,
      monthly_deduction BIGINT NOT NULL DEFAULT 0,
      payload      TEXT NOT NULL,
      language     TEXT NOT NULL DEFAULT 'en',
      status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','under_review','approved','rejected')),
      decision_note TEXT,
      decided_by   INTEGER REFERENCES users(id),
      decided_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loan_repayments (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      loan_id      INTEGER NOT NULL REFERENCES loan_applications(id),
      account_id   INTEGER NOT NULL REFERENCES accounts(id),
      transaction_id INTEGER REFERENCES transactions(id),
      amount       BIGINT NOT NULL,
      description  TEXT,
      created_by   INTEGER REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS site_content (
      section      TEXT PRIMARY KEY,
      data         TEXT NOT NULL,
      updated_by   INTEGER REFERENCES users(id),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS images (
      id           TEXT PRIMARY KEY,
      purpose      TEXT,
      mime         TEXT NOT NULL,
      data_url     TEXT NOT NULL,
      label        TEXT,
      created_by   INTEGER REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS branches (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name         TEXT UNIQUE NOT NULL,
      is_hq        INTEGER NOT NULL DEFAULT 0,
      address      TEXT,
      phone        TEXT,
      email        TEXT,
      manager_name TEXT,
      office_photo TEXT,
      description  TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS correction_requests (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      fields       TEXT NOT NULL,
      note         TEXT,
      status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','applied','rejected')),
      staff_note   TEXT,
      handled_by   INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      handled_at   TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS issued_statements (
      id            INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      code          TEXT UNIQUE NOT NULL,
      user_id       INTEGER NOT NULL REFERENCES users(id),
      period_from   TEXT,
      period_to     TEXT,
      content_hash  TEXT NOT NULL,
      summary       TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      actor_id     INTEGER,
      actor_name   TEXT,
      actor_role   TEXT,
      action       TEXT NOT NULL,
      target_type  TEXT,
      target_id    INTEGER,
      branch       TEXT,
      summary      TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Maker-checker: above-threshold account entries wait here for a second
    -- person to approve before any money moves. A row in 'pending' status holds
    -- NO money; the balance only changes when it is approved.
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

    -- Small key/value store for admin-editable settings (e.g. the approval
    -- threshold). Kept generic so future toggles don't need a schema change.
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_by  INTEGER,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One-time 2FA recovery codes, stored HASHED (never the plaintext). A row is
    -- deleted once used, so a code can't be replayed.
    -- Email verification at signup. A member must prove they control their email
    -- before they can sign in. We store only HASHES of the link token and the
    -- 6-digit code (never the raw values), both expiring after 24h. The code has
    -- an attempt counter so it can be locked after too many wrong guesses.
    CREATE TABLE IF NOT EXISTS email_verifications (
      id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      email       TEXT NOT NULL,
      token_hash  TEXT NOT NULL,      -- sha256 of the long random link token
      code_hash   TEXT NOT NULL,      -- sha256 of the 6-digit code
      attempts    INTEGER NOT NULL DEFAULT 0,
      consumed_at TIMESTAMPTZ,        -- set when successfully verified
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- ── Double-entry ledger ────────────────────────────────────────────────
    -- A real set of books that runs ALONGSIDE the stored account balances. Every
    -- money movement writes a balanced journal entry (total debits = total
    -- credits). The account balance column is kept as a fast cache; the ledger
    -- is the auditable source of truth, and a reconciliation check proves the two
    -- agree. Amounts are whole FCFA (BIGINT), same as everywhere else.
    --
    -- Accounting sign convention (standard):
    --   assets & expenses         → increased by DEBIT
    --   liabilities, equity, income → increased by CREDIT
    -- A member's savings is a LIABILITY of the cooperative (we owe it to them).

    -- Chart of accounts: the ledger accounts (not member accounts).
    CREATE TABLE IF NOT EXISTS ledger_accounts (
      id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      code       TEXT UNIQUE NOT NULL,          -- e.g. 'CASH', 'MEMBER_DEPOSITS'
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,                 -- asset|liability|equity|income|expense
      member_account_id INTEGER REFERENCES accounts(id), -- set for per-member liability sub-accounts
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_member_acct
      ON ledger_accounts(member_account_id) WHERE member_account_id IS NOT NULL;

    -- Journal entry: a single balanced event (a header). Its lines must sum to 0.
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      reference    TEXT,                          -- links back to a transaction/loan/etc.
      description  TEXT,
      posted_by    INTEGER REFERENCES users(id),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Journal lines: the debits and credits. Convention here — a positive
    -- amount is a DEBIT, a negative amount is a CREDIT. The lines of one
    -- entry always sum to exactly zero (enforced in code + a reconciliation test).
    CREATE TABLE IF NOT EXISTS ledger_lines (
      id                INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      entry_id          INTEGER NOT NULL REFERENCES ledger_entries(id),
      ledger_account_id INTEGER NOT NULL REFERENCES ledger_accounts(id),
      amount            BIGINT NOT NULL,          -- >0 debit, <0 credit
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_lines_entry ON ledger_lines(entry_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_lines_account ON ledger_lines(ledger_account_id);

    -- Idempotency: remember the outcome of a money-moving request keyed by a
    -- caller-supplied key, so a retry (timeout, double-click, webhook re-delivery)
    -- returns the original result instead of applying the movement twice.
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      key          TEXT UNIQUE NOT NULL,
      scope        TEXT NOT NULL,                 -- e.g. 'transfer', 'entry'
      response     TEXT,                          -- JSON of the original response
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS recovery_codes (
      id         INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      code_hash  TEXT NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Email verification at signup. One live row per user. We store only HASHES
    -- of the link token and the 6-digit code (never the raw values), an expiry,
    -- and an attempt counter that locks the code after too many wrong guesses.
    CREATE TABLE IF NOT EXISTS email_verifications (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      email        TEXT NOT NULL,
      token_hash   TEXT NOT NULL,
      code_hash    TEXT NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      consumed_at  TIMESTAMPTZ,
      expires_at   TIMESTAMPTZ NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Notification outbox. Every email is queued here first, then a worker
    -- delivers it. Persisting before sending means nothing is lost on a crash,
    -- failures can be retried, and there is an auditable record of what was sent
    -- to whom and when. (SMS can reuse this table later via the channel column.)
    CREATE TABLE IF NOT EXISTS notifications (
      id           INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id      INTEGER REFERENCES users(id),
      channel      TEXT NOT NULL DEFAULT 'email',   -- 'email' now; 'sms' later
      recipient    TEXT NOT NULL,                   -- email address at enqueue time
      event        TEXT NOT NULL,                   -- e.g. 'transaction', 'loan.decision'
      subject      TEXT,
      body         TEXT NOT NULL,                   -- rendered plain-text body
      lang         TEXT NOT NULL DEFAULT 'en',
      status       TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_error   TEXT,
      important    INTEGER NOT NULL DEFAULT 0,       -- 1 = security/essential, always send
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at      TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_loans_user ON loan_applications(user_id);
    CREATE INDEX IF NOT EXISTS idx_loans_status ON loan_applications(status);
    CREATE INDEX IF NOT EXISTS idx_repay_loan ON loan_repayments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_corrections_status ON correction_requests(status);
    CREATE INDEX IF NOT EXISTS idx_corrections_user ON correction_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_statements_code ON issued_statements(code);
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_entries(status);
    CREATE INDEX IF NOT EXISTS idx_pending_branch ON pending_entries(branch);
    CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_emailverif_user ON email_verifications(user_id);
  `);

  // Idempotent column migrations for anything added after first release. In
  // Postgres, ADD COLUMN IF NOT EXISTS makes this a no-op on an up-to-date DB.
  await pool.query(`
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS office_photo TEXT;
    ALTER TABLE branches ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_secret TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_photo TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_extension TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS languages TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0;
  `);

  // Backfill employee IDs for any pre-existing staff/manager rows that lack one.
  const missing = await db.all(
    "SELECT id FROM users WHERE role IN ('staff','manager') AND (employee_id IS NULL OR employee_id = '') ORDER BY id"
  );
  if (missing.length) {
    // Continue the SOWO#### series after the current max.
    const row = await db.one(
      "SELECT COALESCE(MAX((substring(employee_id from 5))::int), 999) AS maxid FROM users WHERE employee_id ~ '^SOWO[0-9]+$'"
    );
    let next = (row?.maxid || 999) + 1;
    for (const u of missing) {
      await db.run('UPDATE users SET employee_id = $1 WHERE id = $2', ['SOWO' + next, u.id]);
      next += 1;
    }
  }
}

/** Close the pool (used by scripts and graceful shutdown). */
export async function closePool() {
  await pool.end();
}
