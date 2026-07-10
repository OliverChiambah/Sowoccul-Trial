#!/usr/bin/env node
/**
 * One-time data migration: SQLite  →  PostgreSQL
 * ────────────────────────────────────────────────────────────────────────────
 * Copies every row from an existing better-sqlite3 database file into the
 * Postgres database pointed to by DATABASE_URL, preserving primary-key IDs so
 * that all foreign-key references stay intact.
 *
 * This is meant to be run ONCE, when you move an existing SQLite deployment to
 * Postgres. On a brand-new install you don't need it — `npm run seed` creates a
 * fresh admin and you start clean.
 *
 * Usage:
 *   1. Make sure the Postgres schema exists first. Either start the server once
 *      (it runs initSchema on boot) or run:  node -e "import('./src/db/index.js').then(m=>m.initSchema())"
 *   2. Point at both databases and run:
 *        SQLITE_FILE=./sowoccul.db DATABASE_URL=postgres://... npm run migrate:sqlite
 *
 * Safety:
 *   • Runs inside ONE transaction — either everything migrates or nothing does.
 *   • Refuses to run if the target tables already contain rows (so you can't
 *     double-import by accident). Override with ALLOW_NONEMPTY=1 if you know
 *     what you're doing.
 *   • Requires the dev-dependency better-sqlite3 to READ the old file:
 *        npm install         (installs devDependencies too)
 *
 * It does not delete or modify the SQLite file. Keep that file as a backup
 * until you've verified the Postgres data looks right.
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { pool, initSchema, closePool } from '../src/db/index.js';

const require = createRequire(import.meta.url);

const SQLITE_FILE = process.env.SQLITE_FILE || './sowoccul.db';
const ALLOW_NONEMPTY = process.env.ALLOW_NONEMPTY === '1';

// Tables in FK-dependency order: parents before children.
// site_content has no integer id (PK is `section`) — handled specially.
const TABLES = [
  { name: 'users',              cols: ['id','username','password_hash','full_name','email','phone','role','can_edit','title','employee_id','must_change_password','review_status','applicant_type','branch','profile','created_at'], hasId: true },
  { name: 'branches',           cols: ['id','name','is_hq','address','phone','email','manager_name','office_photo','description','sort_order','created_at'], hasId: true },
  { name: 'accounts',           cols: ['id','user_id','account_number','type','balance','currency','status','created_at'], hasId: true },
  { name: 'transactions',       cols: ['id','account_id','amount','balance_after','kind','description','counterpart_account_id','created_by','created_at'], hasId: true },
  { name: 'loan_applications',  cols: ['id','reference','user_id','amount','purpose','duration_months','monthly_deduction','payload','language','status','decision_note','decided_by','decided_at','created_at'], hasId: true },
  { name: 'loan_repayments',    cols: ['id','loan_id','account_id','transaction_id','amount','description','created_by','created_at'], hasId: true },
  { name: 'images',             cols: ['id','purpose','mime','data_url','label','created_by','created_at'], hasId: true },
  { name: 'correction_requests',cols: ['id','user_id','fields','note','status','staff_note','handled_by','created_at','handled_at'], hasId: true },
  { name: 'issued_statements',  cols: ['id','code','user_id','period_from','period_to','content_hash','summary','created_at'], hasId: true },
  { name: 'audit_log',          cols: ['id','actor_id','actor_name','actor_role','action','target_type','target_id','branch','summary','created_at'], hasId: true },
  { name: 'site_content',       cols: ['section','data','updated_by','updated_at'], hasId: false },
];

function openSqlite() {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error('\nThis script needs better-sqlite3 to read the old file.');
    console.error('Install dev dependencies first:  npm install\n');
    process.exit(1);
  }
  return new Database(SQLITE_FILE, { readonly: true, fileMustExist: true });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at your Postgres database.');
    process.exit(1);
  }

  console.log(`Reading SQLite file:  ${SQLITE_FILE}`);
  const sqlite = openSqlite();

  // Ensure the Postgres schema exists before we insert.
  await initSchema();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Guard: don't import on top of existing data unless explicitly allowed.
    if (!ALLOW_NONEMPTY) {
      for (const t of TABLES) {
        const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${t.name}`);
        if (rows[0].n > 0) {
          throw new Error(
            `Target table "${t.name}" already has ${rows[0].n} row(s). ` +
            `Refusing to migrate onto non-empty tables. ` +
            `Set ALLOW_NONEMPTY=1 to override.`
          );
        }
      }
    }

    let grandTotal = 0;
    for (const t of TABLES) {
      // Does the source table exist? (older DBs may predate some tables)
      const exists = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
        .get(t.name);
      if (!exists) {
        console.log(`  – ${t.name}: not in source, skipping`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${t.name}`).all();
      if (rows.length === 0) {
        console.log(`  – ${t.name}: 0 rows`);
        continue;
      }

      const colList = t.cols.join(', ');
      const overriding = t.hasId ? 'OVERRIDING SYSTEM VALUE ' : '';
      const placeholders = t.cols.map((_, i) => `$${i + 1}`).join(', ');
      const insertSql =
        `INSERT INTO ${t.name} (${colList}) ${overriding}VALUES (${placeholders})`;

      for (const row of rows) {
        const values = t.cols.map((c) => (row[c] === undefined ? null : row[c]));
        await client.query(insertSql, values);
      }
      grandTotal += rows.length;
      console.log(`  ✓ ${t.name}: ${rows.length} row(s)`);
    }

    // Reset identity sequences so the next inserted row gets MAX(id)+1.
    for (const t of TABLES) {
      if (!t.hasId) continue;
      await client.query(
        `SELECT setval(
            pg_get_serial_sequence($1, 'id'),
            COALESCE((SELECT MAX(id) FROM ${t.name}), 0) + 1,
            false
         )`,
        [t.name]
      );
    }

    await client.query('COMMIT');
    console.log(`\nDone. Migrated ${grandTotal} row(s) across ${TABLES.length} tables.`);
    console.log('Sequences reset. Verify the data, then keep the SQLite file as a backup.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nMigration FAILED and was rolled back. Nothing was written.');
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    sqlite.close();
    await closePool();
  }
}

main();
