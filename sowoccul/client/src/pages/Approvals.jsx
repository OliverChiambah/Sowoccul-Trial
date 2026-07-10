import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money } from '../lib/format.js';

/**
 * Approvals queue — the checker side of maker-checker. Shows pending large
 * account entries. A user sees a request they may act on with Approve/Reject
 * buttons; a request they raised themselves is shown as "awaiting another
 * approver" and they can only cancel it. All rules are re-enforced on the server.
 */
export default function Approvals() {
  const { t } = useLang();
  const [pending, setPending] = useState(null);
  const [threshold, setThreshold] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setError('');
    try {
      const r = await api('/admin/pending');
      setPending(r.pending);
      setThreshold(r.threshold);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function act(id, action, note) {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      await api(`/admin/pending/${id}/${action}`, { method: 'POST', body: note ? { note } : undefined });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  if (!pending) return <div className="loading">…</div>;

  return (
    <>
      <div className="page-eyebrow">{t('nav_approvals')}</div>
      <h1 className="page-title">{t('approvals_title')}</h1>
      <p className="page-intro">
        {t('approvals_intro')}{threshold != null ? ` ${t('approvals_threshold_note')} ${money(threshold)}.` : ''}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      {pending.length === 0 && <div className="empty">{t('approvals_empty')}</div>}

      {pending.map((p) => {
        const debit = Number(p.amount) < 0;
        return (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 17 }}>
                  {debit ? '−' : '+'}{money(Math.abs(Number(p.amount)))}
                  <span className="pill" style={{ marginLeft: 8 }}>{t('kind_' + p.kind) || p.kind}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {t('approvals_account')}: {p.account_number || p.account_id} · {p.branch}
                </div>
                {p.description && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{p.description}</div>}
                <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  {t('approvals_requested_by')} {p.requested_by_name}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {p.is_mine ? (
                  <>
                    <span className="pill" style={{ alignSelf: 'center' }}>{t('approvals_awaiting')}</span>
                    <button className="btn btn-ghost" disabled={busyId === p.id} onClick={() => act(p.id, 'cancel')}>{t('approvals_cancel')}</button>
                  </>
                ) : p.can_approve ? (
                  <>
                    <button className="btn btn-primary" disabled={busyId === p.id} onClick={() => act(p.id, 'approve')}>{t('approvals_approve')}</button>
                    <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} disabled={busyId === p.id}
                      onClick={() => { const note = window.prompt(t('approvals_reject_reason')); if (note !== null) act(p.id, 'reject', note); }}>
                      {t('approvals_reject')}
                    </button>
                  </>
                ) : (
                  <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>{t('approvals_no_permission')}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
