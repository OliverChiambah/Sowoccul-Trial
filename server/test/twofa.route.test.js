import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests, db } from '../src/db/index.js';
import { generateSecret, totp } from '../src/lib/totp.js';

let expressAvailable = true;
try { await import('express'); } catch { expressAvailable = false; }
const opt = { skip: expressAvailable ? false : 'express not installed (runs after npm install)' };

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

async function authHandler(method, path) {
  const { authRouter } = await import('../src/routes/auth.js');
  const layer = authRouter.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

test('login with a 2FA-enabled account returns a challenge, not a token', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const login = await authHandler('post', '/login');
  // bcrypt hash for password "secret" — precomputed with bcryptjs default cost.
  // We instead stub compareSync path by using a known hash of the actual password.
  const bcrypt = (await import('bcryptjs')).default;
  const hash = bcrypt.hashSync('pw12345', 10);
  pool.__queue([
    { rows: [{ id: 4, username: 'jane', full_name: 'Jane', password_hash: hash, twofa_enabled: 1, twofa_secret: 'ABC', role: 'staff' }], rowCount: 1 },
  ]);
  const req = { body: { username: 'jane', password: 'pw12345' }, ip: '1.1.1.1', headers: {}, socket: {} };
  let payload = null, status = 200;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; }, setHeader() {} };
  await login(req, res, (e) => { if (e) throw e; });
  assert.equal(status, 200);
  assert.equal(payload.twofa_required, true);
  assert.ok(payload.challenge, 'a challenge token is issued');
  assert.ok(!payload.token, 'no session token yet');
});

test('completing 2FA with a correct code issues a session token', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const { signTwofaChallenge } = await import('../src/middleware/auth.js');
  const complete = await authHandler('post', '/login/2fa');

  const secret = generateSecret();
  const challenge = signTwofaChallenge(4);
  const code = totp(secret);

  pool.__queue([
    { rows: [{ id: 4, username: 'jane', full_name: 'Jane', role: 'staff', branch: 'Limbe', twofa_enabled: 1, twofa_secret: secret, token_version: 0 }], rowCount: 1 }, // user lookup
    { rows: [], rowCount: 1 }, // audit login
  ]);
  const req = { body: { challenge, code }, ip: '1.1.1.1', headers: {}, socket: {} };
  let payload = null, status = 200;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; }, setHeader() {} };
  await complete(req, res, (e) => { if (e) throw e; });
  assert.equal(status, 200);
  assert.ok(payload.token, 'session token issued after correct 2FA');
});

test('completing 2FA with a wrong code is rejected', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const { signTwofaChallenge } = await import('../src/middleware/auth.js');
  const complete = await authHandler('post', '/login/2fa');
  const secret = generateSecret();
  const challenge = signTwofaChallenge(4);

  pool.__queue([
    { rows: [{ id: 4, full_name: 'Jane', twofa_enabled: 1, twofa_secret: secret }], rowCount: 1 }, // user
    { rows: [], rowCount: 0 }, // recovery-code lookup (no match)
  ]);
  const req = { body: { challenge, code: '000000' }, ip: '1.1.1.1', headers: {}, socket: {} };
  let payload = null, status = 200;
  const res = { status(c) { status = c; return this; }, json(o) { payload = o; return this; }, setHeader() {} };
  await complete(req, res, () => {});
  assert.equal(status, 401);
  assert.ok(!payload.token);
});

test('an expired/invalid challenge is rejected', opt, async () => {
  const pool = makeFakePool();
  __setPoolForTests(pool);
  const complete = await authHandler('post', '/login/2fa');
  const req = { body: { challenge: 'not-a-real-token', code: '123456' }, ip: '1.1.1.1', headers: {}, socket: {} };
  let status = 200;
  const res = { status(c) { status = c; return this; }, json() { return this; }, setHeader() {} };
  await complete(req, res, () => {});
  assert.equal(status, 401);
});
