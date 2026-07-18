/**
 * Notifications — the domain layer between app events and the email outbox.
 *
 * Flow:  event happens  →  notify*()  →  row inserted in `notifications`
 *        (status 'pending')  →  drainOutbox() delivers via lib/mailer  →
 *        status becomes 'sent' or 'failed' (with retry).
 *
 * Why an outbox and not just "send now": money events must not be lost because
 * an email service hiccuped, and the request that triggered them must not hang
 * or fail because of email. Enqueue is a fast local insert; delivery happens
 * separately and can retry. It also gives an auditable record of every message.
 *
 * Templates are bilingual (en/fr) and plain-text (safe, deliverable, and easy to
 * reuse for SMS later). Amounts are formatted in FCFA.
 */

import { db } from '../db/index.js';
import { sendEmail } from './mailer.js';
import { logger } from './logger.js';

const MAX_ATTEMPTS = 5;

function fcfa(n) {
  const v = Math.abs(Number(n) || 0);
  return v.toLocaleString('fr-FR').replace(/\u00a0/g, ' ') + ' FCFA';
}

// ---- Templates -------------------------------------------------------------
// Each returns { subject, body } for the given language. Kept plain and factual.

const T = {
  transaction: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : ${d.credit ? 'dépôt' : 'retrait'} de ${fcfa(d.amount)}`,
    body:
`Bonjour ${d.name},

Un ${d.credit ? 'dépôt' : 'retrait'} a été enregistré sur votre compte.

Montant : ${d.credit ? '+' : '−'}${fcfa(d.amount)}
Compte : ${d.account}
Nouveau solde : ${fcfa(d.balance)}
Date : ${d.when}

Si vous ne reconnaissez pas cette opération, contactez immédiatement votre agence.

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: ${d.credit ? 'deposit' : 'withdrawal'} of ${fcfa(d.amount)}`,
    body:
`Hello ${d.name},

A ${d.credit ? 'deposit' : 'withdrawal'} was recorded on your account.

Amount: ${d.credit ? '+' : '−'}${fcfa(d.amount)}
Account: ${d.account}
New balance: ${fcfa(d.balance)}
Date: ${d.when}

If you do not recognise this transaction, contact your branch immediately.

— SONEL Workers Credit Union (SOWOCCUL)`,
  },

  loan_decision: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : votre demande de prêt a été ${d.approved ? 'approuvée' : 'refusée'}`,
    body:
`Bonjour ${d.name},

Votre demande de prêt (réf. ${d.reference}) a été ${d.approved ? 'APPROUVÉE' : 'refusée'}.
${d.approved ? `Montant : ${fcfa(d.amount)}` : ''}${d.note ? `\nNote : ${d.note}` : ''}

${d.approved ? 'Passez en agence pour finaliser le décaissement.' : 'Vous pouvez contacter votre agence pour en savoir plus.'}

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: your loan application was ${d.approved ? 'approved' : 'declined'}`,
    body:
`Hello ${d.name},

Your loan application (ref. ${d.reference}) was ${d.approved ? 'APPROVED' : 'declined'}.
${d.approved ? `Amount: ${fcfa(d.amount)}` : ''}${d.note ? `\nNote: ${d.note}` : ''}

${d.approved ? 'Please visit your branch to complete disbursement.' : 'You may contact your branch for more information.'}

— SONEL Workers Credit Union (SOWOCCUL)`,
  },

  security: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : alerte de sécurité — ${d.title}`,
    body:
`Bonjour ${d.name},

${d.message}

Si ce n'était pas vous, changez votre mot de passe et contactez votre agence sans tarder.

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: security alert — ${d.title}`,
    body:
`Hello ${d.name},

${d.message}

If this wasn't you, change your password and contact your branch right away.

— SONEL Workers Credit Union (SOWOCCUL)`,
  },

  verify_email: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : confirmez votre adresse e-mail`,
    body:
`Bonjour ${d.name},

Bienvenue à SONEL Workers Credit Union. Pour activer votre compte, confirmez votre adresse e-mail.

Option 1 — cliquez sur ce lien :
${d.link}

Option 2 — saisissez ce code sur la page de confirmation :
${d.code}

Ce lien et ce code expirent dans ${d.hours} heures.

Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: confirm your email address`,
    body:
`Hello ${d.name},

Welcome to SONEL Workers Credit Union. To activate your account, please confirm your email address.

Option 1 — click this link:
${d.link}

Option 2 — enter this code on the confirmation page:
${d.code}

This link and code expire in ${d.hours} hours.

If you did not sign up, you can ignore this email.

— SONEL Workers Credit Union (SOWOCCUL)`,
  },

  approval_needed: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : une écriture attend votre approbation`,
    body:
`Bonjour ${d.name},

Une écriture de ${fcfa(d.amount)} (${d.account}, agence ${d.branch}) attend une seconde approbation.

Connectez-vous à la file d'approbation pour la traiter.

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: an entry needs your approval`,
    body:
`Hello ${d.name},

An entry of ${fcfa(d.amount)} (${d.account}, ${d.branch} branch) is waiting for a second approval.

Sign in to the approvals queue to review it.

— SONEL Workers Credit Union (SOWOCCUL)`,
  },

  member_admitted: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : votre compte a été créé — bienvenue !`,
    body:
`Bonjour ${d.name},

Félicitations ! Votre compte a été créé et validé par ${d.branch ? `l'agence de ${d.branch}` : 'votre agence'}.

Pour vous connecter :
• Identifiant : votre adresse e-mail (${d.email})
• Mot de passe : celui que vous avez choisi lors de votre inscription

Connectez-vous ici : ${d.loginUrl}
${d.note ? `\nMessage de votre agence : ${d.note}\n` : ''}
Bienvenue à SONEL Workers Credit Union.

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: your account has been created — welcome!`,
    body:
`Hello ${d.name},

Congratulations! Your account has been created and approved by ${d.branch ? `the ${d.branch} branch` : 'your branch'}.

To sign in:
• Username: your email address (${d.email})
• Password: the one you chose when you registered

Sign in here: ${d.loginUrl}
${d.note ? `\nMessage from your branch: ${d.note}\n` : ''}
Welcome to SONEL Workers Credit Union.

— SONEL Workers Credit Union (SOWOCCUL)`,
  },

  member_more_info: (lang, d) => lang === 'fr' ? {
    subject: `SOWOCCUL : informations complémentaires nécessaires pour votre inscription`,
    body:
`Bonjour ${d.name},

Merci pour votre demande d'adhésion. Avant de valider votre compte, ${d.branch ? `l'agence de ${d.branch}` : 'votre agence'} a besoin de précisions :

${d.message}

Veuillez répondre à cet e-mail ou passer en agence avec les éléments demandés. Votre demande reste en attente jusque-là.

— SONEL Workers Credit Union (SOWOCCUL)`,
  } : {
    subject: `SOWOCCUL: more information needed for your registration`,
    body:
`Hello ${d.name},

Thank you for your membership application. Before we can approve your account, ${d.branch ? `the ${d.branch} branch` : 'your branch'} needs some more details:

${d.message}

Please reply to this email or visit the branch with the requested items. Your application stays pending until then.

— SONEL Workers Credit Union (SOWOCCUL)`,
  },
};

// ---- Enqueue ---------------------------------------------------------------

/**
 * Queue one notification. Never throws into the caller — a failure to enqueue an
 * email must not roll back a money transaction. Returns the row id or null.
 *
 * @param {object} o
 * @param {number} o.userId      recipient user id (for preference + record)
 * @param {string} o.event       template key: transaction|loan_decision|security|approval_needed
 * @param {object} o.data        template data
 * @param {boolean} [o.important] security/essential — bypasses opt-out
 */
export async function enqueueEmail({ userId, event, data, important = false }) {
  try {
    const u = await db.one('SELECT id, full_name, email, languages, notify_email FROM users WHERE id = $1', [userId]);
    if (!u || !u.email) return null;                      // nobody to email
    if (!important && u.notify_email === 0) return null;  // opted out of non-essential

    const lang = /fr/i.test(u.languages || '') ? 'fr' : 'en';
    const tpl = T[event];
    if (!tpl) { logger.warn('notify.unknown_event', { event }); return null; }
    const { subject, body } = tpl(lang, { name: (u.full_name || '').split(' ')[0] || u.full_name, ...data });

    const row = await db.one(
      `INSERT INTO notifications (user_id, channel, recipient, event, subject, body, lang, important)
       VALUES ($1, 'email', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [u.id, u.email, event, subject, body, lang, important ? 1 : 0]
    );
    return row ? row.id : null;
  } catch (e) {
    logger.error('notify.enqueue_failed', { event, error: e.message });
    return null;   // swallow — never break the triggering operation
  }
}

// ---- Delivery worker -------------------------------------------------------

/**
 * Deliver pending notifications. Safe to call repeatedly (e.g. on an interval)
 * and safe to run while requests are served. Each message is attempted up to
 * MAX_ATTEMPTS times before being marked 'failed'. Returns a small summary.
 */
export async function drainOutbox(limit = 25) {
  let sent = 0, failed = 0;
  let rows = [];
  try {
    rows = await db.all(
      `SELECT id, recipient, subject, body, attempts FROM notifications
       WHERE status = 'pending' ORDER BY created_at LIMIT $1`, [limit]
    );
  } catch (e) {
    logger.error('notify.drain_query_failed', { error: e.message });
    return { sent, failed };
  }

  for (const n of rows) {
    try {
      await sendEmail({ to: n.recipient, subject: n.subject, body: n.body });
      await db.run(`UPDATE notifications SET status = 'sent', attempts = attempts + 1, sent_at = now() WHERE id = $1`, [n.id]);
      sent++;
    } catch (e) {
      const attempts = (n.attempts || 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await db.run(
        `UPDATE notifications SET status = $2, attempts = $3, last_error = $4 WHERE id = $1`,
        [n.id, status, attempts, String(e.message).slice(0, 300)]
      );
      failed++;
      logger.warn('notify.send_failed', { id: n.id, attempts, status, error: e.message });
    }
  }
  if (sent || failed) logger.info('notify.drain', { sent, failed });
  return { sent, failed };
}

// ---- Convenience wrappers used by routes -----------------------------------

export const notify = {
  transaction: (userId, data) => enqueueEmail({ userId, event: 'transaction', data }),
  loanDecision: (userId, data) => enqueueEmail({ userId, event: 'loan_decision', data }),
  security: (userId, data) => enqueueEmail({ userId, event: 'security', data, important: true }),
  approvalNeeded: (userId, data) => enqueueEmail({ userId, event: 'approval_needed', data }),
  verifyEmail: (userId, data) => enqueueEmail({ userId, event: 'verify_email', data, important: true }),
  memberAdmitted: (userId, data) => enqueueEmail({ userId, event: 'member_admitted', data, important: true }),
  memberMoreInfo: (userId, data) => enqueueEmail({ userId, event: 'member_more_info', data, important: true }),
};
