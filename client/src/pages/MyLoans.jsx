import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money, formatDate } from '../lib/format.js';
import { StatusPill } from '../components/ui.jsx';

export default function MyLoans() {
  const { lang, t } = useLang();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { loans } = await api('/loans/mine');
        if (active) setLoans(loans);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="loading">…</div>;

  return (
    <>
      <div className="page-eyebrow">{t('loans_eyebrow')}</div>
      <h1 className="page-title">{t('loans_title')}</h1>
      <p className="page-intro">{t('loans_intro')}</p>

      {loans.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="big">{t('no_loans')}</div>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link to="/apply" className="btn btn-gold">{t('apply_now')}</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('ref')}</th>
                <th>{t('purpose')}</th>
                <th style={{ textAlign: 'right' }}>{t('tx_amount')}</th>
                <th>{t('status')}</th>
                <th>{t('submitted')}</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="mono" style={{ fontSize: 12.5 }}>{l.reference}</td>
                  <td className="tx-desc" style={{ maxWidth: 260 }}>{l.purpose}
                    {l.decision_note && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{l.decision_note}</div>
                    )}
                  </td>
                  <td className="amt">{money(l.amount)}</td>
                  <td><StatusPill status={l.status} /></td>
                  <td className="tx-date">{formatDate(l.created_at, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
