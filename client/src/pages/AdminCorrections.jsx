import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';

/**
 * Staff queue of member data-correction requests, scoped to the staff member's
 * branch. Applying writes the requested values; both actions are audited and
 * need edit rights (enforced on the server).
 */
export default function AdminCorrections() {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { const r = await api('/admin/corrections'); setItems(r.corrections); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function act(id, decision) {
    setMsg(null);
    try {
      await api(`/admin/corrections/${id}`, { method: 'POST', body: { decision } });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  const fieldLabel = (k) => t(`field_${k}`);
  if (!items) return <div className="loading">…</div>;

  return (
    <>
      <div className="page-eyebrow">{t('corr_eyebrow')}</div>
      <h1 className="page-title">{t('corr_title')}</h1>
      <p className="page-intro">{t('corr_intro')}</p>

      {msg && !msg.ok && <div className="alert alert-error">{msg.text}</div>}

      {items.length === 0
        ? <div className="card"><div className="empty">{t('corr_empty')}</div></div>
        : items.map((c) => (
          <div className="card" key={c.id}>
            <div className="card-legend" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{c.member_name} · {c.member_branch}</span>
              <span className="muted">{c.created_at}</span>
            </div>
            <table className="tx-table">
              <thead><tr><th>{t('corr_field')}</th><th>{t('corr_current')}</th><th>{t('corr_requested')}</th></tr></thead>
              <tbody>
                {Object.entries(c.fields).map(([k, v]) => (
                  <tr key={k}>
                    <td>{fieldLabel(k)}</td>
                    <td className="muted">{v.current || '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{v.requested}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.note && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t('corr_member_note')}: {c.note}</p>}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => act(c.id, 'apply')}>{t('corr_apply')}</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => act(c.id, 'reject')}>{t('corr_reject')}</button>
            </div>
          </div>
        ))}
    </>
  );
}
