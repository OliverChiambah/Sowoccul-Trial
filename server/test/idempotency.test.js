import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setPoolForTests } from '../src/db/index.js';
import { beginIdempotent } from '../src/lib/idempotency.js';

// Fake pool for the idempotency_keys table.
function makeFakePool() {
  const keys = new Map();  // key -> { scope, response }
  return {
    keys,
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT response FROM idempotency_keys WHERE key')) {
        const row = keys.get(params[0]);
        return { rows: row ? [{ response: row.response }] : [] };
      }
      if (s.startsWith('INSERT INTO idempotency_keys')) {
        if (keys.has(params[0])) { const e = new Error('duplicate key'); throw e; }
        keys.set(params[0], { scope: params[1], response: null });
        return { rows: [] };
      }
      if (s.startsWith('UPDATE idempotency_keys SET response')) {
        const row = keys.get(params[1]);
        if (row) row.response = params[0];
        return { rows: [] };
      }
      throw new Error('Unexpected SQL: ' + s.slice(0, 80));
    },
  };
}

function reqWith(key) {
  return { get: (h) => (h === 'Idempotency-Key' ? key : null), body: {} };
}

test('no key → proceeds normally, no dedupe', async () => {
  __setPoolForTests(makeFakePool());
  const idem = await beginIdempotent(reqWith(null), 'transfer');
  assert.equal(idem.replay, false);
  assert.equal(idem.key, null);
  await idem.finish(200, { ok: true });  // no-op, must not throw
});

test('first call proceeds; identical key replays the stored response', async () => {
  __setPoolForTests(makeFakePool());
  const first = await beginIdempotent(reqWith('abc-123'), 'transfer');
  assert.equal(first.replay, false);
  await first.finish(200, { ok: true, newFrom: 60000, newTo: 40000 });

  // Second time with the same key: must replay, not re-run.
  const second = await beginIdempotent(reqWith('abc-123'), 'transfer');
  assert.equal(second.replay, true);
  assert.deepEqual(second.response, { ok: true, newFrom: 60000, newTo: 40000 });
});

test('a different key is treated as a new request', async () => {
  __setPoolForTests(makeFakePool());
  const a = await beginIdempotent(reqWith('key-a'), 'transfer');
  await a.finish(200, { ok: true, v: 1 });
  const b = await beginIdempotent(reqWith('key-b'), 'transfer');
  assert.equal(b.replay, false);
});

test('body idempotency_key is honoured when no header is present', async () => {
  __setPoolForTests(makeFakePool());
  const req = { get: () => null, body: { idempotency_key: 'body-key' } };
  const first = await beginIdempotent(req, 'transfer');
  assert.equal(first.replay, false);
  await first.finish(200, { ok: true });
  const again = await beginIdempotent(req, 'transfer');
  assert.equal(again.replay, true);
});
