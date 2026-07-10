/**
 * Rate limiting — in-memory, dependency-free.
 * ────────────────────────────────────────────────────────────────────────────
 * A fixed-window limiter keyed by IP (and optionally a body field like username)
 * to blunt brute-force and abuse on sensitive routes, especially login.
 *
 * IMPORTANT LIMITATION: this state lives in the process memory of ONE instance.
 * If you run multiple instances/replicas, each has its own counters, so the
 * effective limit is (limit × instances). For a single small deployment this is
 * fine and a big improvement over nothing. When you scale out, move this to a
 * shared store (Redis) — the interface here (a keyed counter with a TTL) maps
 * directly onto Redis INCR + EXPIRE. This is deliberately the smallest thing
 * that meaningfully helps today.
 *
 * Usage:
 *   app.post('/api/auth/login', rateLimit({ windowMs: 15*60_000, max: 10, keyBy: 'username' }), ...)
 */

export function rateLimit({ windowMs = 15 * 60 * 1000, max = 30, keyBy = null, name = 'rl' } = {}) {
  /** key → { count, resetAt } */
  const hits = new Map();

  // Periodically drop expired entries so the Map doesn't grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, rec] of hits) if (rec.resetAt <= now) hits.delete(k);
  }, windowMs);
  if (sweep.unref) sweep.unref(); // don't keep the process alive for this

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const extra = keyBy && req.body && req.body[keyBy] ? String(req.body[keyBy]).toLowerCase() : '';
    const key = `${name}:${ip}:${extra}`;
    const now = Date.now();

    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count += 1;

    const remaining = Math.max(0, max - rec.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (rec.count > max) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      if (req.log) req.log.warn('ratelimit.blocked', { key: name, ip, path: req.path });
      return res.status(429).json({
        error: 'Too many attempts. Please wait a little while and try again.',
        retry_after_seconds: retryAfter,
      });
    }
    next();
  };
}
