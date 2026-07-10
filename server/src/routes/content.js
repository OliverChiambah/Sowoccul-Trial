import { Router } from 'express';
import { getContent } from '../lib/content.js';
import { db } from '../db/index.js';
import { listBranches, headquarters, branchWithStaff } from '../lib/branches.js';
import { verifyStatement } from '../lib/statements.js';
import { ah } from '../lib/async-handler.js';

// Public, read-only website content for the landing, team and careers pages.
export const contentRouter = Router();

/** GET /api/content/verify/:code — public statement verification. */
contentRouter.get('/verify/:code', ah(async (req, res) => {
  const found = await verifyStatement(req.params.code);
  if (!found) return res.status(404).json({ error: 'No statement was found with that code.' });
  res.json({ ok: true, statement: found });
}));

contentRouter.get('/branches', ah(async (req, res) => {
  res.json({ branches: await listBranches(), headquarters: await headquarters() });
}));

// One branch with the staff assigned to it (for the public branch page).
contentRouter.get('/branch/:idOrName', ah(async (req, res) => {
  const result = await branchWithStaff(decodeURIComponent(req.params.idOrName));
  if (!result) return res.status(404).json({ error: 'Branch not found.' });
  res.json(result);
}));

// Serve an uploaded image by id (used in <img src>), with light caching.
contentRouter.get('/images/:id', ah(async (req, res) => {
  const row = await db.one('SELECT mime, data_url FROM images WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).end();
  const base64 = row.data_url.split(',')[1] || '';
  const buf = Buffer.from(base64, 'base64');
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.end(buf);
}));

contentRouter.get('/:section', ah(async (req, res) => {
  const allowed = ['team', 'careers', 'contact', 'landing', 'login', 'register', 'privacy', 'terms'];
  const section = req.params.section;
  if (!allowed.includes(section)) {
    return res.status(404).json({ error: 'Unknown content section.' });
  }
  res.json({ section, data: await getContent(section) });
}));
