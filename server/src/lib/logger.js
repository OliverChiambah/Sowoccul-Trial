/**
 * Structured logging — dependency-free.
 * ────────────────────────────────────────────────────────────────────────────
 * Emits one JSON object per line (JSON Lines), which any log aggregator (Render
 * logs, Datadog, Loki, an ELK stack) can parse. Plain console.log strings are
 * almost useless once you have real traffic; structured logs let you filter by
 * request id, level, route, or user.
 *
 * Usage:
 *   import { logger } from './lib/logger.js';
 *   logger.info('server.start', { port });
 *   logger.error('db.query_failed', { err });
 *
 * Per-request, use req.log (attached by requestContext middleware) so every line
 * automatically carries the request id and user id:
 *   req.log.warn('transfer.insufficient_funds', { from, amount });
 *
 * LOG_LEVEL env var (debug|info|warn|error) sets the threshold; default info.
 * In test, set LOG_LEVEL=silent to keep output clean.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function threshold() {
  const l = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[l] ?? LEVELS.info;
}

function serializeErr(err) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // Stack only at debug level or when explicitly wanted — keep logs lean.
      stack: threshold() <= LEVELS.debug ? err.stack : undefined,
      userSafe: err.userSafe || undefined,
    };
  }
  return { message: String(err) };
}

function emit(level, event, fields = {}) {
  if (LEVELS[level] < threshold()) return;
  const line = {
    t: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  if (fields.err) line.err = serializeErr(fields.err);
  // stdout for info/debug, stderr for warn/error — standard practice.
  const out = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  try {
    out.write(JSON.stringify(line) + '\n');
  } catch {
    // Never let logging throw and take down a request.
    out.write(`{"t":"${line.t}","level":"${level}","event":"${event}","log_error":true}\n`);
  }
}

function make(base = {}) {
  return {
    debug: (event, fields) => emit('debug', event, { ...base, ...fields }),
    info: (event, fields) => emit('info', event, { ...base, ...fields }),
    warn: (event, fields) => emit('warn', event, { ...base, ...fields }),
    error: (event, fields) => emit('error', event, { ...base, ...fields }),
    /** Return a new logger that always includes these fields. */
    child: (fields) => make({ ...base, ...fields }),
  };
}

export const logger = make();
