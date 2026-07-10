/**
 * Idempotency for money-moving endpoints.
 *
 * A client (or a payment webhook) may retry a request it isn't sure completed —
 * a timeout, a double-tap, a re-delivered callback. Without protection, the money
 * moves twice. With an idempotency key, the second attempt returns the FIRST
 * attempt's result and changes nothing.
 *
 * Usage in a route:
 *   const idem = await beginIdempotent(req, 'transfer');
 *   if (idem.replay) return res.status(idem.status).json(idem.response);
 *   ... do the money movement, get `result` ...
 *   await idem.finish(200, result);
 *   return res.json(result);
 *
 * The key comes from the `Idempotency-Key` header or a body `idempotency_key`.
 * If no key is supplied, the request proceeds normally (no dedupe) — so this is
 * opt-in and never blocks existing clients, but is available the moment mobile
 * money or a mobile app wants it.
 */

import { db } from '../db/index.js';

export async function beginIdempotent(req, scope) {
  const key = (req.get?.('Idempotency-Key') || req.body?.idempotency_key || '').toString().trim();
  if (!key) {
    // No key → no dedupe. finish() becomes a no-op.
    return { replay: false, key: null, finish: async () => {} };
  }

  // Have we already handled this key?
  const existing = await db.one('SELECT response FROM idempotency_keys WHERE key = $1', [key]);
  if (existing) {
    let response = {};
    try { response = existing.response ? JSON.parse(existing.response) : {}; } catch { /* ignore */ }
    return { replay: true, key, status: 200, response };
  }

  // Reserve the key now so a concurrent duplicate can't slip through. If two
  // requests race, the unique constraint makes the second insert fail — we treat
  // that as a replay.
  try {
    await db.run('INSERT INTO idempotency_keys (key, scope) VALUES ($1, $2)', [key, scope]);
  } catch {
    const row = await db.one('SELECT response FROM idempotency_keys WHERE key = $1', [key]);
    let response = {};
    try { response = row?.response ? JSON.parse(row.response) : {}; } catch { /* ignore */ }
    return { replay: true, key, status: 200, response };
  }

  return {
    replay: false,
    key,
    async finish(_status, response) {
      await db.run('UPDATE idempotency_keys SET response = $1 WHERE key = $2', [JSON.stringify(response), key]);
    },
  };
}
