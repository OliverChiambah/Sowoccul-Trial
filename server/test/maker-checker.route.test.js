import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests, db } from '../src/db/index.js';

let expressAvailable = true;
try { await import('express'); } catch { expressAvailable = false; }

function makeFakePool() {
  const log = [];
  let script = [];
  const pool = {
    __queue(r) { script = r.slice(); },
    __log: log,
    on() {},
    async query(text, params = []) { log.push({ text: text.replace(/\s+/g, ' ').trim(), params }); return script.length ? script.shift() : { rows: [], rowCount: 0 }; },
    async connect() { return { query: (t, p = []) => pool.query(t, p), release() { log.push({ released: true }); } }; },
    async end() {},
  };
  return pool;
}

async function getHandler(method, path) {
  const { adminRouter } = await import('../src/routes/admin.js');
  const layer = adminRouter.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  if (!layer) return null;
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

const opt = { skip: expressAvailable ? false : 'express not installed (runs after npm install)' };

test('entry at/above threshold is queued, not posted', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/accounts/:id/entry');
  assert.ok(handler, 'entry route present');

  // account lookup, owner lookup, threshold read, pending insert, audit insert
  pool.__queue([
    { rows: [{ id: 3, user_id: 9, status: 'active', balance: '1000000', account_number: 'AC-3' }], rowCount: 1 }, // account
    { rows: [{ branch: 'Limbe' }], rowCount: 1 },                       // owner branch
    { rows: [{ value: '500000' }], rowCount: 1 },                       // threshold
    { rows: [{ id: 77 }], rowCount: 1 },                                // pending insert RETURNING id
    { rows: [], rowCount: 1 },                                          // audit
  ]);

  const req = {
    params: { id: '3' },
    body: { amount: 600000, kind: 'withdrawal', description: 'big one' },
    user: { id: 2, role: 'staff', title: 'cashier', branch: 'Limbe', name: 'Cashier' },
  };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, (e) => { if (e) throw e; });

  assert.equal(status, 202);
  assert.equal(payload.pending, true);
  assert.equal(payload.pending_id, 77);
  // No balance UPDATE happened — money did not move.
  assert.ok(!pool.__log.some((e) => /UPDATE accounts SET balance/.test(e.text || '')));
  assert.ok(pool.__log.some((e) => /INSERT INTO pending_entries/.test(e.text || '')));
});

test('entry below threshold posts immediately', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/accounts/:id/entry');
  pool.__queue([
    { rows: [{ id: 3, user_id: 9, status: 'active', balance: '1000000', account_number: 'AC-3' }], rowCount: 1 },
    { rows: [{ branch: 'Limbe' }], rowCount: 1 },
    { rows: [{ value: '500000' }], rowCount: 1 },   // threshold
    { rows: [], rowCount: 0 },                       // BEGIN
    { rows: [], rowCount: 1 },                       // UPDATE balance
    { rows: [], rowCount: 1 },                       // INSERT tx
    { rows: [], rowCount: 0 },                       // COMMIT
    { rows: [], rowCount: 1 },                       // audit
  ]);
  const req = {
    params: { id: '3' },
    body: { amount: 100000, kind: 'deposit' },
    user: { id: 2, role: 'staff', title: 'cashier', branch: 'Limbe', name: 'Cashier' },
  };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, (e) => { if (e) throw e; });
  assert.equal(status, 200);
  assert.ok(!payload.pending);
  assert.ok(pool.__log.some((e) => /UPDATE accounts SET balance/.test(e.text || '')), 'money moved');
});

test('the requester cannot approve their own pending entry (maker ≠ checker)', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/pending/:id/approve');
  // pending lookup returns an entry requested by user 2; user 2 tries to approve.
  pool.__queue([
    { rows: [{ id: 77, account_id: 3, amount: '600000', kind: 'withdrawal', status: 'pending', requested_by: 2, requested_by_name: 'Cashier', branch: 'Limbe' }], rowCount: 1 },
  ]);
  const req = { params: { id: '77' }, user: { id: 2, role: 'staff', title: 'branch_manager', branch: 'Limbe', name: 'Cashier' } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, () => {});
  assert.equal(status, 403);
  assert.match(payload.error, /cannot approve a transaction you requested/i);
  // Nothing moved.
  assert.ok(!pool.__log.some((e) => /UPDATE accounts SET balance/.test(e.text || '')));
});

test('a different authorised approver moves the money on approval', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/pending/:id/approve');
  pool.__queue([
    { rows: [{ id: 77, account_id: 3, amount: '600000', kind: 'withdrawal', status: 'pending', requested_by: 2, requested_by_name: 'Cashier', branch: 'Limbe' }], rowCount: 1 }, // pending
    { rows: [{ id: 3, status: 'active', balance: '1000000', account_number: 'AC-3' }], rowCount: 1 }, // account re-read
    { rows: [], rowCount: 0 },                 // BEGIN
    { rows: [], rowCount: 1 },                 // UPDATE balance
    { rows: [{ id: 555 }], rowCount: 1 },      // INSERT tx RETURNING id
    { rows: [], rowCount: 1 },                 // UPDATE pending -> approved
    { rows: [], rowCount: 0 },                 // COMMIT
    { rows: [], rowCount: 1 },                 // audit
  ]);
  // A General Manager (role manager), different person, approves.
  const req = { params: { id: '77' }, user: { id: 5, role: 'manager', branch: null, name: 'GM' } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, (e) => { if (e) throw e; });
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  // 600000 debit on 1,000,000 → 400,000
  assert.equal(payload.balance, 400000);
  assert.ok(pool.__log.some((e) => /UPDATE accounts SET balance/.test(e.text || '')), 'money moved on approval');
  assert.ok(pool.__log.some((e) => /UPDATE pending_entries SET status = 'approved'/.test(e.text || '')));
});

test('a branch manager cannot approve another branch\'s entry', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/pending/:id/approve');
  pool.__queue([
    { rows: [{ id: 78, account_id: 4, amount: '600000', kind: 'withdrawal', status: 'pending', requested_by: 2, requested_by_name: 'Cashier', branch: 'Douala' }], rowCount: 1 },
  ]);
  // Branch manager of Limbe tries to approve a Douala entry.
  const req = { params: { id: '78' }, user: { id: 8, role: 'staff', title: 'branch_manager', branch: 'Limbe', name: 'BM Limbe' } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, () => {});
  assert.equal(status, 403);
  assert.ok(!pool.__log.some((e) => /UPDATE accounts SET balance/.test(e.text || '')));
});

test('a plain cashier cannot approve at all', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/pending/:id/approve');
  pool.__queue([
    { rows: [{ id: 79, account_id: 4, amount: '600000', kind: 'withdrawal', status: 'pending', requested_by: 2, requested_by_name: 'X', branch: 'Limbe' }], rowCount: 1 },
  ]);
  const req = { params: { id: '79' }, user: { id: 9, role: 'staff', title: 'cashier', branch: 'Limbe', name: 'Cashier2' } };
  let status = 200;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  await handler(req, res, () => {});
  assert.equal(status, 403);
});

test('already-handled request cannot be approved again', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const handler = await getHandler('post', '/pending/:id/approve');
  pool.__queue([
    { rows: [{ id: 80, account_id: 4, amount: '600000', kind: 'withdrawal', status: 'approved', requested_by: 2, branch: 'Limbe' }], rowCount: 1 },
  ]);
  const req = { params: { id: '80' }, user: { id: 5, role: 'admin', name: 'Admin' } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, () => {});
  assert.equal(status, 409);
});
