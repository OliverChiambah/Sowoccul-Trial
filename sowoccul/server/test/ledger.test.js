import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../src/db/index.js';
import {
  ensureChart, postEntry, postMemberMovement, reconcile, trialBalance, accountId, memberLiabilityAccount, backfillOpeningBalances,
} from '../src/lib/ledger.js';

/**
 * In-memory fake pool modelling the ledger tables well enough to exercise the
 * double-entry invariants: balanced posting, per-member reconciliation, and the
 * global trial balance. Member accounts live in `accounts`.
 */
function makeFakePool() {
  const ledgerAccounts = [];   // {id, code, name, type, member_account_id}
  const entries = [];          // {id}
  const lines = [];            // {id, entry_id, ledger_account_id, amount}
  const accounts = [];         // {id, balance}
  let laId = 1, enId = 1, lnId = 1;

  const pool = {
    ledgerAccounts, entries, lines, accounts,
    seedAccount(id, balance) { accounts.push({ id, balance }); },
    async one(sql, params) { const r = await this.query(sql, params); return r.rows[0] || null; },
    async all(sql, params) { const r = await this.query(sql, params); return r.rows; },
    async run(sql, params) { const r = await this.query(sql, params); return { rowCount: r.rows.length, rows: r.rows }; },
    async connect() {
      const self = this;
      return {
        async query(text, params) {
          const t = text.replace(/\s+/g, ' ').trim();
          if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [], rowCount: 0 };
          return self.query(text, params);
        },
        release() {},
      };
    },
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT INTO ledger_accounts (code, name, type) VALUES')) {
        if (!ledgerAccounts.find((a) => a.code === params[0])) {
          ledgerAccounts.push({ id: laId++, code: params[0], name: params[1], type: params[2], member_account_id: null });
        }
        return { rows: [] };
      }
      if (s.startsWith('SELECT id FROM ledger_accounts WHERE code')) {
        const a = ledgerAccounts.find((x) => x.code === params[0]);
        return { rows: a ? [{ id: a.id }] : [] };
      }
      if (s.startsWith('SELECT id FROM ledger_accounts WHERE member_account_id')) {
        const a = ledgerAccounts.find((x) => x.member_account_id === params[0]);
        return { rows: a ? [{ id: a.id }] : [] };
      }
      if (s.startsWith('INSERT INTO ledger_accounts (code, name, type, member_account_id)')) {
        const a = { id: laId++, code: params[0], name: params[1], type: 'liability', member_account_id: params[2] };
        ledgerAccounts.push(a);
        return { rows: [{ id: a.id }] };
      }
      if (s.startsWith('INSERT INTO ledger_entries')) {
        const e = { id: enId++ }; entries.push(e); return { rows: [{ id: e.id }] };
      }
      if (s.startsWith('INSERT INTO ledger_lines')) {
        lines.push({ id: lnId++, entry_id: params[0], ledger_account_id: params[1], amount: Number(params[2]) });
        return { rows: [] };
      }
      if (s.startsWith('SELECT COALESCE(SUM(amount),0)::bigint AS bal FROM ledger_lines WHERE ledger_account_id')) {
        const bal = lines.filter((l) => l.ledger_account_id === params[0]).reduce((x, l) => x + l.amount, 0);
        return { rows: [{ bal }] };
      }
      if (s.startsWith('SELECT COALESCE(SUM(amount),0)::bigint AS total FROM ledger_lines')) {
        return { rows: [{ total: lines.reduce((x, l) => x + l.amount, 0) }] };
      }
      // reconcile query
      if (s.includes('FROM accounts a') && s.includes('ledger_balance')) {
        const rows = accounts.map((a) => {
          const memberLedgers = ledgerAccounts.filter((la) => la.member_account_id === a.id).map((la) => la.id);
          const led = -lines.filter((l) => memberLedgers.includes(l.ledger_account_id)).reduce((x, l) => x + l.amount, 0);
          return { account_id: a.id, balance: a.balance, ledger_balance: led };
        });
        return { rows };
      }
      // backfill query: accounts with NO member ledger lines yet
      if (s.includes('FROM accounts a') && s.includes('NOT EXISTS')) {
        const rows = accounts.filter((a) => {
          const memberLedgers = ledgerAccounts.filter((la) => la.member_account_id === a.id).map((la) => la.id);
          return !lines.some((l) => memberLedgers.includes(l.ledger_account_id));
        }).map((a) => ({ id: a.id, balance: a.balance }));
        return { rows };
      }
      throw new Error('Unexpected SQL: ' + s.slice(0, 90));
    },
  };
  return pool;
}

function setup() {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  return pool;
}

test('the chart of accounts seeds and is idempotent', async () => {
  const pool = setup();
  await ensureChart();
  await ensureChart();  // second call must not duplicate
  const codes = pool.ledgerAccounts.map((a) => a.code);
  assert.ok(codes.includes('CASH'));
  assert.ok(codes.includes('MEMBER_DEPOSITS'));
  assert.equal(codes.filter((c) => c === 'CASH').length, 1);
});

test('postEntry REFUSES an unbalanced entry', async () => {
  const pool = setup();
  await ensureChart();
  const cash = await accountId('CASH');
  const dep = await accountId('MEMBER_DEPOSITS');
  await assert.rejects(
    () => postEntry(pool, { description: 'bad', lines: [
      { account: cash, amount: 1000 }, { account: dep, amount: -999 },  // sums to 1, not 0
    ] }),
    /Unbalanced/
  );
  // Nothing should have been written.
  assert.equal(pool.entries.length, 0);
});

test('a deposit posts a balanced entry and reconciles', async () => {
  const pool = setup();
  await ensureChart();
  pool.seedAccount(1, 0);
  // Simulate a 50,000 deposit: ledger side only (the cache is set separately in prod).
  await postMemberMovement(pool, { memberAccountId: 1, delta: 50000, description: 'deposit' });
  // Set the cache to match what postToAccount would have written.
  pool.accounts[0].balance = 50000;

  const tb = await trialBalance();
  assert.equal(tb.ok, true, 'all lines sum to zero');

  const rec = await reconcile();
  assert.equal(rec.ok, true);
  assert.equal(rec.checked, 1);
  assert.equal(rec.mismatches.length, 0);
});

test('reconcile DETECTS a drift between cache and ledger', async () => {
  const pool = setup();
  await ensureChart();
  pool.seedAccount(1, 0);
  await postMemberMovement(pool, { memberAccountId: 1, delta: 50000 });
  // Corrupt the cache so it disagrees with the ledger.
  pool.accounts[0].balance = 99999;

  const rec = await reconcile();
  assert.equal(rec.ok, false);
  assert.equal(rec.mismatches.length, 1);
  assert.equal(rec.mismatches[0].account_id, 1);
  assert.equal(rec.mismatches[0].balance, 99999);
  assert.equal(rec.mismatches[0].ledger_balance, 50000);
});

test('deposit then withdrawal nets correctly in the ledger', async () => {
  const pool = setup();
  await ensureChart();
  pool.seedAccount(1, 0);
  await postMemberMovement(pool, { memberAccountId: 1, delta: 50000 });   // +50,000
  await postMemberMovement(pool, { memberAccountId: 1, delta: -20000 });  // −20,000
  pool.accounts[0].balance = 30000;

  assert.equal((await trialBalance()).ok, true);
  const rec = await reconcile();
  assert.equal(rec.ok, true, JSON.stringify(rec.mismatches));
});

test('a transfer between two member accounts keeps the books balanced', async () => {
  const pool = setup();
  await ensureChart();
  pool.seedAccount(1, 100000);
  pool.seedAccount(2, 0);
  // Opening balance on acct 1 came from a real deposit — journal it too.
  await postMemberMovement(pool, { memberAccountId: 1, delta: 100000, description: 'opening' });
  // Move 40,000 from acct 1 to acct 2 (two legs).
  await postMemberMovement(pool, { memberAccountId: 1, delta: -40000, description: 'transfer out' });
  await postMemberMovement(pool, { memberAccountId: 2, delta: 40000, description: 'transfer in' });
  pool.accounts[0].balance = 60000;
  pool.accounts[1].balance = 40000;

  assert.equal((await trialBalance()).ok, true);
  const rec = await reconcile();
  assert.equal(rec.ok, true, JSON.stringify(rec.mismatches));
  assert.equal(rec.checked, 2);
});

test('backfill brings pre-existing balances into the ledger and then reconciles', async () => {
  const pool = setup();
  await ensureChart();
  // Two accounts already have balances but NO ledger history (like a fresh deploy).
  pool.seedAccount(1, 75000);
  pool.seedAccount(2, 0);        // zero balance — nothing to open
  pool.seedAccount(3, 12000);

  const before = await reconcile();
  assert.equal(before.ok, false, 'unbackfilled balances should NOT reconcile');

  const bf = await backfillOpeningBalances();
  assert.equal(bf.posted, 2, 'two non-zero accounts opened (acct 2 skipped)');

  const after = await reconcile();
  assert.equal(after.ok, true, JSON.stringify(after.mismatches));
  assert.equal((await trialBalance()).ok, true);

  // Idempotent: running it again posts nothing.
  const again = await backfillOpeningBalances();
  assert.equal(again.posted, 0);
});
