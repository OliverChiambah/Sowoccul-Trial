import { db } from '../db/index.js';

/**
 * Append an entry to the audit log. Append-only — there is no update or delete.
 * `req` supplies the actor (from req.user). Everything else describes the event.
 *
 *   await record(req, 'account.entry', {
 *     targetType: 'account', targetId: 42, branch: 'Douala',
 *     summary: 'Posted a 5,000 FCFA deposit to account 000123',
 *   });
 */
export async function record(req, action, opts = {}) {
  const actor = req && req.user ? req.user : {};
  await db.run(`
    INSERT INTO audit_log (actor_id, actor_name, actor_role, action, target_type, target_id, branch, summary)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    actor.id || null,
    actor.name || null,
    actor.role || null,
    action,
    opts.targetType || null,
    opts.targetId || null,
    opts.branch || null,
    opts.summary || action,
  ]);
}

/** Log an event with an explicit actor object (used where there's no req yet, e.g. login). */
export async function recordFor(actor, action, opts = {}) {
  await db.run(`
    INSERT INTO audit_log (actor_id, actor_name, actor_role, action, target_type, target_id, branch, summary)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    actor?.id || null,
    actor?.full_name || actor?.name || null,
    actor?.role || null,
    action,
    opts.targetType || null,
    opts.targetId || null,
    opts.branch || null,
    opts.summary || action,
  ]);
}

/** Read the log, newest first, with optional filters and a limit. */
export async function listAudit({ action, actorId, limit = 200 } = {}) {
  const conds = [];
  const params = [];
  if (action) { params.push(action); conds.push(`action = $${params.length}`); }
  if (actorId) { params.push(actorId); conds.push(`actor_id = $${params.length}`); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const cap = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
  return db.all(`SELECT * FROM audit_log${where} ORDER BY id DESC LIMIT ${cap}`, params);
}
