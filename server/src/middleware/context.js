/**
 * Request context + error handling.
 * ────────────────────────────────────────────────────────────────────────────
 * requestContext(): assigns each request an id, attaches a request-scoped
 * logger (req.log) carrying that id, and logs a completion line with status and
 * duration. The id is also returned in the `X-Request-Id` response header so a
 * member reporting a problem can quote it and you can find the exact request.
 *
 * errorHandler(): the single place server errors are turned into responses.
 * Domain errors marked `userSafe` (e.g. MoneyError) return their message with an
 * appropriate status; everything else logs the full error and returns a generic
 * 500 WITHOUT leaking internals to the client.
 */
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

export function requestContext(req, res, next) {
  const id = req.headers['x-request-id'] || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  req.log = logger.child({ req_id: id });

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    req.log.info('request.done', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(ms),
      user_id: req.user?.id,
    });
  });

  next();
}

/**
 * Central error handler. Must be registered LAST, after all routes.
 * Express identifies it by its four arguments.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const log = req.log || logger;

  // User-safe domain errors (validation, money range, etc.)
  if (err && err.userSafe) {
    const status = err.status || 400;
    log.warn('request.user_error', { err, path: req.path, status });
    return res.status(status).json({ error: err.message });
  }

  // Body-parser JSON errors surface as SyntaxError with a status.
  if (err && err.type === 'entity.parse.failed') {
    log.warn('request.bad_json', { path: req.path });
    return res.status(400).json({ error: 'The request body was not valid JSON.' });
  }

  // Everything else is unexpected — log full detail, return generic message.
  log.error('request.unhandled_error', { err, path: req.path });
  res.status(500).json({
    error: 'Something went wrong on our side. Please try again.',
    request_id: req.id,
  });
}
