import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests, db } from '../src/db/index.js';

// Route tests need express (a real dependency). In this offline sandbox it may
// not be installed; when that's the case we skip those tests rather than fail,
// and they run normally after `npm install`.
let expressAvailable = true;
try { await import('express'); } catch { expressAvailable = false; }

/**
 * A scripted fake pool: you queue responses, it returns them in order and
 * records every query. Enough to drive route logic through the real db helpers
 * (db.one/all/run/tx) without a real Postgres.
 */
function makeFakePool() {
  const log = [];
  let script = [];
  const answer = (text) => {
    if (script.length) return script.shift();
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    __queue(resps) { script = resps.slice(); },
    __log: log,
    on() {},
    async query(text, params = []) { log.push({ text: text.replace(/\s+/g, ' ').trim(), params }); return answer(text); },
    async connect() {
      return {
        query: (t, p = []) => pool.query(t, p),
        release: () => log.push({ released: true }),
      };
    },
    async end() {},
  };
  return pool;
}

test('db.tx commits and returns callback value', async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  pool.__queue([
    { rows: [], rowCount: 0 },            // BEGIN
    { rows: [{ id: 99 }], rowCount: 1 },  // insert
    { rows: [], rowCount: 0 },            // COMMIT
  ]);
  const out = await db.tx(async (t) => {
    const r = await t.one('INSERT ... RETURNING id');
    return r.id;
  });
  assert.equal(out, 99);
  const texts = pool.__log.map((e) => e.text || (e.released ? 'RELEASE' : ''));
  assert.ok(texts.includes('BEGIN'));
  assert.ok(texts.includes('COMMIT'));
  assert.ok(texts.includes('RELEASE'));
});

test('db.tx rolls back on throw and still releases', async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  pool.__queue([{ rows: [], rowCount: 0 }]); // BEGIN
  await assert.rejects(() => db.tx(async () => { throw new Error('boom'); }), /boom/);
  const texts = pool.__log.map((e) => e.text || (e.released ? 'RELEASE' : ''));
  assert.ok(texts.includes('ROLLBACK'));
  assert.ok(texts.includes('RELEASE'));
});

test('db.one returns first row or null', async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  pool.__queue([{ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 }]);
  assert.deepEqual(await db.one('SELECT ...'), { id: 1 });
  pool.__queue([{ rows: [], rowCount: 0 }]);
  assert.equal(await db.one('SELECT ...'), null);
});

test('transfer route: happy path does double-entry inside one transaction', { skip: expressAvailable ? false : 'express not installed (runs after npm install)' }, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);

  // Import the real route and pull the /transfer handler off the router stack.
  const { accountsRouter } = await import('../src/routes/accounts.js');

  // Find the POST /transfer layer on the router stack.
  const layer = accountsRouter.stack.find(
    (l) => l.route && l.route.path === '/transfer' && l.route.methods.post
  );
  assert.ok(layer, 'transfer route is registered');
  const stack = layer.route.stack;
  const handler = stack[stack.length - 1].handle; // ah-wrapped body (after validateBody)
  const validateMw = stack[0].handle; // validateBody

  // Queue: SELECT from, SELECT to, BEGIN, UPDATE, UPDATE, INSERT, INSERT, COMMIT
  pool.__queue([
    { rows: [{ id: 1, user_id: 42, status: 'active', balance: '100000' }], rowCount: 1 },
    { rows: [{ id: 2, user_id: 42, status: 'active', balance: '25000' }], rowCount: 1 },
    { rows: [], rowCount: 0 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 1 },
    { rows: [], rowCount: 0 },
  ]);

  const req = { body: { from_account_id: 1, to_account_id: 2, amount: 30000, description: 'rent' }, user: { id: 42 } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };

  // Run validateBody then the handler (mimicking express chaining).
  await new Promise((resolve) => validateMw(req, res, resolve));
  await handler(req, res, (e) => { if (e) throw e; });

  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.newFrom, 70000);
  assert.equal(payload.newTo, 55000);
  const texts = pool.__log.map((e) => e.text || (e.released ? 'RELEASE' : ''));
  assert.ok(texts.includes('BEGIN') && texts.includes('COMMIT'));
  assert.equal(texts.filter((t) => /INSERT INTO transactions/.test(t)).length, 2);
});

test('transfer route: rejects transfer to same account (400, no tx)', { skip: expressAvailable ? false : 'express not installed (runs after npm install)' }, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const { accountsRouter } = await import('../src/routes/accounts.js');
  const layer = accountsRouter.stack.find((l) => l.route && l.route.path === '/transfer');
  const stack = layer.route.stack;
  const handler = stack[stack.length - 1].handle;
  const validateMw = stack[0].handle;

  const req = { body: { from_account_id: 5, to_account_id: 5, amount: 1000 }, user: { id: 42 } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await new Promise((resolve) => validateMw(req, res, resolve));
  await handler(req, res, () => {});
  assert.equal(status, 400);
  assert.match(payload.error, /two different accounts/);
  assert.ok(!pool.__log.some((e) => e.text === 'BEGIN'));
});
