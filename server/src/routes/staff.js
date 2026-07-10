import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole, requirePasswordChanged } from '../middleware/auth.js';
import { ah } from '../lib/async-handler.js';
import { titleLabel } from '../lib/titles.js';

export const staffRouter = Router();

// The internal staff directory is for colleagues only: any signed-in staff,
// manager, or admin — NOT regular members. requirePasswordChanged keeps a
// first-login staffer from browsing before setting their password.
staffRouter.use(requireAuth, requirePasswordChanged, requireRole('staff', 'manager', 'admin'));

/**
 * GET /api/staff/directory — the internal directory.
 * Returns each staff member's public-to-colleagues profile: name, title, branch,
 * employee id, work contact, photo, bio, start date, languages. Deliberately
 * omits login/security fields (password hash, token version, review flags).
 */
staffRouter.get('/directory', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT id, full_name, email, phone, role, title, employee_id, branch,
           staff_photo, bio, start_date, work_extension, languages
    FROM users
    WHERE role IN ('staff','manager')
    ORDER BY branch, role DESC, full_name
  `);
  const staff = rows.map((r) => ({ ...r, title_label: titleLabel(r.title) }));
  res.json({ staff });
}));

/**
 * GET /api/staff/directory/:id — one colleague's directory profile.
 * Same visibility rule as the list.
 */
staffRouter.get('/directory/:id', ah(async (req, res) => {
  const r = await db.one(`
    SELECT id, full_name, email, phone, role, title, employee_id, branch,
           staff_photo, bio, start_date, work_extension, languages
    FROM users
    WHERE id = $1 AND role IN ('staff','manager')
  `, [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Staff member not found.' });
  res.json({ staff: { ...r, title_label: titleLabel(r.title) } });
}));
