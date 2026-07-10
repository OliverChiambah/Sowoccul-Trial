import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { __setPoolForTests } from '../src/db/index.js';
import {
  issueVerification, verifyByToken, verifyByCode, isVerified, VERIFY, MAX_ATTEMPTS,
} from '../src/lib/email-verify.js';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// In-memory fake of the pg pool covering the queries email-verify.js runs.
function makeFakePool({ users }) {
  const verifs = [];
  let nextId = 1;
  return {
    verifs, users,
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('DELETE FROM email_verifications WHERE user_id')) {
        for (let i = verifs.length - 1; i >= 0; i--) if (verifs[i].user_id === params[0]) verifs.splice(i, 1);
        return { rows: [] };
      }
      if (s.startsWith('INSERT INTO email_verifications')) {
        verifs.push({
          id: nextId++, user_id: params[0], email: params[1],
          token_hash: params[2], code_hash: params[3], expires_at: params[4],
          attempts: 0, consumed_at: null, created_at: new Date().toISOString(),
        });
        return { rows: [] };
      }
      if (s.startsWith('SELECT * FROM email_verifications WHERE token_hash')) {
        const row = verifs.find((v) => v.token_hash === params[0] && v.consumed_at === null);
        return { rows: row ? [row] : [] };
      }
      if (s.startsWith('SELECT id FROM users WHERE email')) {
        const u = users.find((x) => x.email.toLowerCase() === params[0]);
        return { rows: u ? [{ id: u.id }] : [] };
      }
      if (s.includes('FROM email_verifications WHERE user_id') && s.includes('consumed_at IS NULL')) {
        const row = [...verifs].reverse().find((v) => v.user_id === params[0] && v.consumed_at === null);
        return { rows: row ? [row] : [] };
      }
      if (s.startsWith('UPDATE email_verifications SET attempts')) {
        const row = verifs.find((v) => v.id === params[1]);
        if (row) row.attempts = params[0];
        return { rows: [] };
      }
      if (s.startsWith('UPDATE email_verifications SET consumed_at')) {
        const row = verifs.find((v) => v.id === params[0]);
        if (row) row.consumed_at = new Date().toISOString();
        return { rows: [] };
      }
      if (s.startsWith('UPDATE users SET email_verified')) {
        const u = users.find((x) => x.id === params[0]);
        if (u) u.email_verified = 1;
        return { rows: [] };
      }
      if (s.startsWith('SELECT email_verified FROM users')) {
        const u = users.find((x) => x.id === params[0]);
        return { rows: u ? [{ email_verified: u.email_verified || 0 }] : [] };
      }
      throw new Error('Unexpected SQL: ' + s.slice(0, 80));
    },
  };
}

function setup() {
  const pool = makeFakePool({ users: [{ id: 1, email: 'new@member.cm', email_verified: 0 }] });
  __setPoolForTests(pool);
  return pool;
}

test('a correct link token verifies the email', async () => {
  const pool = setup();
  const { token } = await issueVerification(1, 'new@member.cm');
  const { result, userId } = await verifyByToken(token);
  assert.equal(result, VERIFY.OK);
  assert.equal(userId, 1);
  assert.equal(await isVerified(1), true);
});

test('a wrong link token is rejected and does not verify', async () => {
  const pool = setup();
  await issueVerification(1, 'new@member.cm');
  const { result } = await verifyByToken('deadbeef'.repeat(8));
  assert.equal(result, VERIFY.BAD_TOKEN);
  assert.equal(await isVerified(1), false);
});

test('the correct 6-digit code verifies the email', async () => {
  const pool = setup();
  const { code } = await issueVerification(1, 'new@member.cm');
  const { result, userId } = await verifyByCode('new@member.cm', code);
  assert.equal(result, VERIFY.OK);
  assert.equal(userId, 1);
  assert.equal(await isVerified(1), true);
});

test('a wrong code decrements attempts and reports attemptsLeft', async () => {
  const pool = setup();
  await issueVerification(1, 'new@member.cm');
  const r = await verifyByCode('new@member.cm', '000000');
  // (In the astronomically unlikely case the real code was 000000, skip.)
  if (r.result === VERIFY.OK) return;
  assert.equal(r.result, VERIFY.BAD_CODE);
  assert.equal(r.attemptsLeft, MAX_ATTEMPTS - 1);
  assert.equal(await isVerified(1), false);
});

test('the code locks after MAX_ATTEMPTS wrong guesses', async () => {
  const pool = setup();
  const { code } = await issueVerification(1, 'new@member.cm');
  const wrong = code === '111111' ? '222222' : '111111';
  let last;
  for (let i = 0; i < MAX_ATTEMPTS; i++) last = await verifyByCode('new@member.cm', wrong);
  assert.equal(last.result, VERIFY.LOCKED);
  // Even the *correct* code no longer works once locked.
  const after = await verifyByCode('new@member.cm', code);
  assert.equal(after.result, VERIFY.LOCKED);
  assert.equal(await isVerified(1), false);
});

test('an expired verification cannot be used (token or code)', async () => {
  const pool = setup();
  const { token, code } = await issueVerification(1, 'new@member.cm');
  // Force expiry in the fake store.
  pool.verifs[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await verifyByToken(token)).result, VERIFY.EXPIRED);
  assert.equal((await verifyByCode('new@member.cm', code)).result, VERIFY.EXPIRED);
  assert.equal(await isVerified(1), false);
});

test('issuing a new verification invalidates the previous code', async () => {
  const pool = setup();
  const first = await issueVerification(1, 'new@member.cm');
  const second = await issueVerification(1, 'new@member.cm');
  // The first code should no longer match the live (second) row.
  const r = await verifyByCode('new@member.cm', first.code);
  // Either it's treated as a wrong guess against the new row, or not found —
  // both mean the old code no longer verifies.
  assert.notEqual(r.result, VERIFY.OK);
  // The second code still works.
  const ok = await verifyByCode('new@member.cm', second.code);
  assert.equal(ok.result, VERIFY.OK);
});
