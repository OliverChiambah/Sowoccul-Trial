/**
 * Wraps an async route handler so any thrown error (or rejected promise) is
 * forwarded to Express's error middleware instead of becoming an unhandled
 * rejection. Express 5 does this natively; on Express 4 we need this shim.
 *
 *   router.get('/x', ah(async (req, res) => { ... }));
 */
export function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
