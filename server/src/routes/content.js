import { Router } from 'express';
import express from 'express';
import { getContent } from '../lib/content.js';
import { db } from '../db/index.js';
import { listBranches, headquarters, branchWithStaff } from '../lib/branches.js';
import { verifyStatement } from '../lib/statements.js';
import { ah } from '../lib/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validatePdfDataUrl } from '../lib/pdf-upload.js';

// Public, read-only website content for the landing, team and careers pages.
export const contentRouter = Router();

// Careers applications are public but rate-limited to deter abuse.
const applyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 6, name: 'job-apply' });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * POST /api/content/careers/apply — public job application submission.
 * Body: { position, branch, full_name, email, phone, dob, address, education,
 *         experience, message, cv (pdf data URL), cover (pdf data URL) }
 * The CV is required; the cover letter is optional. Both must be real PDFs.
 * Stored for the General Manager and IT administrator to review and download.
 */
contentRouter.post('/careers/apply', applyLimiter, express.json({ limit: '8mb' }), ah(async (req, res) => {
  const b = req.body || {};
  const fullName = String(b.full_name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();

  if (!fullName) return res.status(400).json({ error: 'Enter your full name.' });
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

  // CV is required and must be a real PDF.
  const cv = validatePdfDataUrl(String(b.cv || ''));
  if (!cv.ok) return res.status(400).json({ error: `CV: ${cv.error}` });

  // Cover letter is optional, but if provided must also be a real PDF.
  let coverData = null, coverName = null;
  if (b.cover && String(b.cover).length > 0) {
    const cover = validatePdfDataUrl(String(b.cover));
    if (!cover.ok) return res.status(400).json({ error: `Cover letter: ${cover.error}` });
    coverData = cover.dataUrl;
    coverName = String(b.cover_filename || 'cover-letter.pdf').slice(0, 200);
  }

  const clip = (s, n) => (s == null ? null : String(s).trim().slice(0, n) || null);

  const inserted = await db.one(
    `INSERT INTO job_applications
       (position, branch, full_name, email, phone, dob, address, education, experience, message,
        cv_filename, cv_data, cover_filename, cover_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      clip(b.position, 200), clip(b.branch, 100), fullName, email, clip(b.phone, 40),
      clip(b.dob, 20), clip(b.address, 300), clip(b.education, 4000), clip(b.experience, 4000),
      clip(b.message, 2000),
      clip(b.cv_filename, 200) || 'cv.pdf', cv.dataUrl, coverName, coverData,
    ]
  );

  res.status(201).json({ ok: true, id: inserted.id });
}));
