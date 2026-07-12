import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { formatDateTime } from '../lib/format.js';

// Friendly labels for the machine action keys.
const ACTION_LABELS = {
  'auth.login': { en: 'Sign in', fr: 'Connexion' },
  'auth.password_change': { en: 'Password change', fr: 'Changement de mot de passe' },
  'account.entry': { en: 'Account entry', fr: 'Écriture de compte' },
  'account.adjustment': { en: 'Adjustment', fr: 'Ajustement' },
  'loan.decision': { en: 'Loan decision', fr: 'Décision de prêt' },
  'loan.repayment': { en: 'Loan repayment', fr: 'Remboursement' },
  'member.create': { en: 'Member created', fr: 'Membre créé' },
  'member.reviewed': { en: 'Member reviewed', fr: 'Membre vérifié' },
  'member.admitted': { en: 'Member admitted', fr: 'Membre admis' },
  'member.info_requested': { en: 'More info requested', fr: 'Infos complémentaires demandées' },
  'member.reassign': { en: 'Member reassigned', fr: 'Membre réaffecté' },
  'staff.create': { en: 'Staff created', fr: 'Personnel créé' },
  'staff.edit_rights': { en: 'Edit rights changed', fr: 'Droits modifiés' },
  'staff.profile_update': { en: 'Staff profile updated', fr: 'Profil du personnel mis à jour' },
  'entry.pending': { en: 'Approval requested', fr: 'Approbation demandée' },
  'entry.approved': { en: 'Entry approved', fr: 'Écriture approuvée' },
  'entry.rejected': { en: 'Entry rejected', fr: 'Écriture rejetée' },
  'entry.cancelled': { en: 'Request cancelled', fr: 'Demande annulée' },
  'settings.threshold': { en: 'Approval limit changed', fr: 'Seuil d’approbation modifié' },
  'settings.require_2fa': { en: '2FA requirement changed', fr: 'Exigence 2FA modifiée' },
  'twofa.enabled': { en: '2FA turned on', fr: '2FA activée' },
  'twofa.disabled': { en: '2FA turned off', fr: '2FA désactivée' },
  'twofa.admin_reset': { en: '2FA reset by admin', fr: '2FA réinitialisée par l’admin' },
  'twofa.recovery_used': { en: '2FA recovery code used', fr: 'Code de secours 2FA utilisé' },
  'twofa.recovery_regenerated': { en: '2FA recovery codes regenerated', fr: 'Codes de secours 2FA régénérés' },
  'staff.remove': { en: 'Staff removed', fr: 'Personnel retiré' },
  'user.deletion_requested': { en: 'Deletion requested', fr: 'Suppression demandée' },
  'user.deletion_approved': { en: 'Deletion approved', fr: 'Suppression approuvée' },
  'user.deletion_rejected': { en: 'Deletion declined', fr: 'Suppression refusée' },
  'user.deletion_cancelled': { en: 'Deletion withdrawn', fr: 'Suppression retirée' },
  'user.force_password_reset': { en: 'Password reset required', fr: 'Réinit. mot de passe requise' },
  'user.verification_resent': { en: 'Verification re-sent', fr: 'Vérification renvoyée' },
  'user.email_verified_by_admin': { en: 'Email verified by admin', fr: 'E-mail vérifié par l’admin' },
  'application.status': { en: 'Application decision', fr: 'Décision de candidature' },
  'member.self_update': { en: 'Self-updated contact', fr: 'Coordonnées mises à jour' },
  'correction.request': { en: 'Correction requested', fr: 'Correction demandée' },
  'correction.apply': { en: 'Correction applied', fr: 'Correction appliquée' },
  'correction.reject': { en: 'Correction rejected', fr: 'Correction rejetée' },
};

/**
 * Read-only audit trail (admin + General Manager). Append-only on the server —
 * there is no way to edit or delete entries from here.
 */
export default function AuditLog() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState(null);
  const [ledger, setLedger] = useState(null);   // ledger health; null = not loaded/allowed

  // Ledger health is GM-only; if forbidden (e.g. IT admin), just don't show it.
  useEffect(() => {
    let active = true;
    api('/admin/ledger/reconcile')
      .then((r) => { if (active) setLedger(r); })
      .catch(() => { if (active) setLedger(null); });
    return () => { active = false; };
  }, []);

  async function load() {
    setErr(null);
    try {
      const q = filter === 'all' ? '' : `?action=${encodeURIComponent(filter)}`;
      const r = await api(`/admin/audit${q}`);
      setData(r);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [filter]);

  const actionLabel = (a) => (ACTION_LABELS[a] ? ACTION_LABELS[a][lang] || ACTION_LABELS[a].en : a);
  const when = (s) => formatDateTime(s, lang);

  if (err) return (<><h1 className="page-title">{t('audit_title')}</h1><div className="alert alert-error">{err}</div></>);
  if (!data) return <div className="loading">…</div>;

  return (
    <>
      <div className="page-eyebrow">{t('audit_eyebrow')}</div>
      <h1 className="page-title">{t('audit_title')}</h1>
      <p className="page-intro">{t('audit_intro')}</p>

      {ledger && (
        <div className={`alert ${ledger.healthy ? 'alert-ok' : 'alert-error'}`} style={{ marginBottom: 18 }}>
          {ledger.healthy
            ? t('ledger_healthy')
            : t('ledger_unhealthy').replace('{n}', (ledger.reconciliation?.mismatches?.length || 0))}
        </div>
      )}

      <div className="stepper" style={{ marginBottom: 18 }}>
        <button className={'step-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>{t('audit_all')}</button>
        {data.actions.map((a) => (
          <button key={a} className={'step-chip' + (filter === a ? ' active' : '')} onClick={() => setFilter(a)}>{actionLabel(a)}</button>
        ))}
      </div>

      <div className="card">
        {data.entries.length === 0
          ? <div className="empty">{t('audit_empty')}</div>
          : (
            <table className="tx-table">
              <thead><tr><th>{t('audit_when')}</th><th>{t('audit_who')}</th><th>{t('audit_action')}</th><th>{t('audit_detail')}</th></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="tx-date" style={{ whiteSpace: 'nowrap' }}>{when(e.created_at)}</td>
                    <td><div className="tx-desc">{e.actor_name || '—'}</div><div className="tx-date">{e.actor_role || ''}</div></td>
                    <td><span className="pill">{actionLabel(e.action)}</span></td>
                    <td style={{ fontSize: 13 }}>{e.summary}{e.branch ? ` · ${e.branch}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </>
  );
}
