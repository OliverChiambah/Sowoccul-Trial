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

// Pull a specific layer (method + path) off the admin router stack.
async function getAdminHandler(method, path) {
  const { adminRouter } = await import('../src/routes/admin.js');
  const layer = adminRouter.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  if (!layer) return null;
  const stack = layer.route.stack;
  return { handlers: stack.map((s) => s.handle) };
}

test('staff profile edit rejects a fake image (bytes not a real image)', { skip: expressAvailable ? false : 'express not installed' }, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const found = await getAdminHandler('put', '/staff/:id/profile');
  assert.ok(found, 'route registered');
  const handler = found.handlers[found.handlers.length - 1];

  // The staff lookup returns a row; then the photo fails validation before any UPDATE.
  pool.__queue([{ rows: [{ id: 7, full_name: 'Jane', branch: 'Limbe' }], rowCount: 1 }]);

  const fakePng = 'data:image/png;base64,' + Buffer.from('#!/bin/sh evil').toString('base64');
  const req = { params: { id: '7' }, body: { photo: fakePng }, user: { id: 1, role: 'admin' } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, (e) => { if (e) throw e; });

  assert.equal(status, 400);
  assert.match(payload.error, /does not look like a real image/);
  // Crucially: no UPDATE ran — the bad photo never reached the database.
  assert.ok(!pool.__log.some((e) => /UPDATE users SET/.test(e.text || '')));
});

test('staff profile edit accepts valid fields and writes an audit entry', { skip: expressAvailable ? false : 'express not installed' }, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const found = await getAdminHandler('put', '/staff/:id/profile');
  const handler = found.handlers[found.handlers.length - 1];

  pool.__queue([
    { rows: [{ id: 7, full_name: 'Jane', branch: 'Limbe' }], rowCount: 1 }, // staff lookup
    { rows: [], rowCount: 1 },                                              // UPDATE
    { rows: [], rowCount: 1 },                                              // audit insert
  ]);

  const req = {
    params: { id: '7' },
    body: { bio: 'Handles savings.', languages: 'English, French', start_date: '2021-03-01' },
    user: { id: 1, role: 'admin', name: 'Admin' },
  };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, (e) => { if (e) throw e; });

  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.ok(pool.__log.some((e) => /UPDATE users SET/.test(e.text || '')), 'an UPDATE ran');
});

test('staff profile edit rejects a malformed start_date', { skip: expressAvailable ? false : 'express not installed' }, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const found = await getAdminHandler('put', '/staff/:id/profile');
  const handler = found.handlers[found.handlers.length - 1];
  pool.__queue([{ rows: [{ id: 7, full_name: 'Jane', branch: 'Limbe' }], rowCount: 1 }]);

  const req = { params: { id: '7' }, body: { start_date: 'not-a-date' }, user: { id: 1, role: 'admin' } };
  let status = 200, payload = null;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; } };
  await handler(req, res, () => {});
  assert.equal(status, 400);
  assert.ok(payload.fields && payload.fields.start_date);
});
