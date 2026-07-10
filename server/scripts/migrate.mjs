/**
 * Migration runner — versioned, ordered, recorded.
 * ────────────────────────────────────────────────────────────────────────────
 * `initSchema()` in db/index.js builds a fresh database and is idempotent, which
 * is fine for standing one up. But evolving a LIVE database over months needs
 * something with a memory: which changes have already run, applied in order,
 * recorded so they never run twice. That's what this is.
 *
 * Migrations live in server/migrations/ as files named NNNN_description.mjs,
 * each exporting `async function up(client)`. They run in filename order inside
 * a transaction, and each is recorded in the schema_migrations table. Running
 * the runner again applies only the ones not yet recorded.
 *
 *   npm run migrate         # apply all pending migrations
 *   npm run migrate:status  # list applied vs pending
 *
 * We intentionally keep this tiny and forward-only (no auto "down"). For a
 * cooperative's ledger, reversing a migration in production is dangerous; the
 * safe recovery path is restore-from-backup (which you now have and have
 * tested), not an automated rollback. If a migration is wrong, you write a new
 * migration that corrects it.
 */
import { readdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { pool, closePool } from '../src/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrationFiles() {
  let files;
  try {
    files = await readdir(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  return files.filter((f) => /^\d+.*\.mjs$/.test(f)).sort();
}

async function appliedSet(client) {
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

export async function status() {
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const files = await listMigrationFiles();
    const applied = await appliedSet(client);
    return files.map((name) => ({ name, applied: applied.has(name) }));
  } finally {
    client.release();
  }
}

export async function migrate() {
  const client = await pool.connect();
  let count = 0;
  try {
    await ensureTable(client);
    const files = await listMigrationFiles();
    const applied = await appliedSet(client);
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('[migrate] Nothing to do — database is up to date.');
      return 0;
    }

    for (const name of pending) {
      const mod = await import(pathToFileURL(join(MIGRATIONS_DIR, name)).href);
      if (typeof mod.up !== 'function') {
        throw new Error(`Migration ${name} does not export an "up(client)" function.`);
      }
      console.log(`[migrate] Applying ${name} ...`);
      await client.query('BEGIN');
      try {
        await mod.up(client);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        count += 1;
        console.log(`[migrate]   ✓ ${name}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[migrate]   ✗ ${name} failed — rolled back. No further migrations run.`);
        throw e;
      }
    }
    console.log(`[migrate] Done. Applied ${count} migration(s).`);
    return count;
  } finally {
    client.release();
  }
}

// CLI entry: `node scripts/migrate.mjs` or `... status`
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cmd = process.argv[2] || 'up';
  const run = cmd === 'status'
    ? status().then((rows) => {
        if (rows.length === 0) { console.log('No migration files found.'); return; }
        for (const r of rows) console.log(`  ${r.applied ? '✓ applied ' : '· pending '} ${r.name}`);
      })
    : migrate();
  run
    .catch((e) => { console.error('[migrate] Failed:', e.message); process.exitCode = 1; })
    .finally(async () => { await closePool(); });
}
