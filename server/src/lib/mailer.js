/**
 * Email provider interface.
 *
 * The rest of the app never talks to an email service directly — it calls
 * `sendEmail()` here. Which provider actually sends is chosen by environment,
 * so switching from the built-in mock to a real service is a config change, not
 * a code change.
 *
 *   EMAIL_PROVIDER = 'mock'  (default) — logs the message, "succeeds". Nothing
 *                                        leaves the server. Safe for dev/testing.
 *   EMAIL_PROVIDER = 'smtp'            — sends via SMTP using EMAIL_SMTP_* vars
 *                                        (needs the optional `nodemailer` dep).
 *   EMAIL_PROVIDER = 'http'            — POSTs to EMAIL_HTTP_URL (a transactional
 *                                        email API). Generic; adapt headers/body
 *                                        to your chosen provider.
 *
 * Every provider returns { ok: true } on success or throws on failure — the
 * caller (the outbox worker) handles retries and status.
 *
 * FROM address: EMAIL_FROM (default noreply@sowoccul.cm).
 */

import { logger } from './logger.js';

const FROM = process.env.EMAIL_FROM || 'SOWOCCUL <noreply@sowoccul.cm>';
const PROVIDER = (process.env.EMAIL_PROVIDER || 'mock').toLowerCase();

// A place the mock stores what it "sent", so tests and the dev UI can inspect it.
export const mockOutbox = [];

async function sendMock({ to, subject, body }) {
  mockOutbox.push({ to, subject, body, at: new Date().toISOString() });
  logger.info('email.mock', { to, subject, preview: (body || '').slice(0, 80) });
  return { ok: true, provider: 'mock' };
}

async function sendSmtp({ to, subject, body }) {
  // Lazy import so the app runs without nodemailer unless SMTP is actually used.
  let nodemailer;
  try { nodemailer = (await import('nodemailer')).default; }
  catch { throw new Error("EMAIL_PROVIDER=smtp requires the 'nodemailer' package (npm i nodemailer)."); }
  const transport = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT || 587),
    secure: String(process.env.EMAIL_SMTP_SECURE || '') === 'true',
    auth: process.env.EMAIL_SMTP_USER
      ? { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({ from: FROM, to, subject, text: body });
  return { ok: true, provider: 'smtp' };
}

async function sendHttp({ to, subject, body }) {
  const url = process.env.EMAIL_HTTP_URL;
  if (!url) throw new Error('EMAIL_PROVIDER=http requires EMAIL_HTTP_URL.');
  // Generic shape — adapt to your provider's API (auth header, field names).
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EMAIL_HTTP_AUTH ? { Authorization: process.env.EMAIL_HTTP_AUTH } : {}),
    },
    body: JSON.stringify({ from: FROM, to, subject, text: body }),
  });
  if (!res.ok) throw new Error(`Email HTTP provider returned ${res.status}`);
  return { ok: true, provider: 'http' };
}

/**
 * Send one email. Returns { ok: true } or throws. The caller handles retries.
 */
export async function sendEmail({ to, subject, body }) {
  if (!to) throw new Error('sendEmail: missing recipient.');
  switch (PROVIDER) {
    case 'smtp': return sendSmtp({ to, subject, body });
    case 'http': return sendHttp({ to, subject, body });
    case 'mock':
    default: return sendMock({ to, subject, body });
  }
}

export function emailProviderName() { return PROVIDER; }
