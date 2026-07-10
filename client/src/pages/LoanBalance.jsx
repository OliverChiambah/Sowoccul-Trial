import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money, formatDate, formatFCFA, digitsOnly } from '../lib/format.js';

export default function LoanBalance() {
  const { lang, t } = useLang();
  const [data, setData] = useState(null);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mdAmount, setMdAmount] = useState('');
  const [msg, setMsg] = useState(null); // {type, text}
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [bal, loans] = await Promise.all([api('/loans/balance'), api('/loans/mine')]);
    setData(bal);
    setMine(loans.loans);
    if (bal.loan) setMdAmount(bal.loan.monthly_deduction ? formatFCFA(bal.loan.monthly_deduction) : '');
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveMonthly() {
    setMsg(null); setBusy(true);
    try {
      await api('/loans/monthly-deduction', { method: 'PUT', body: { amount: parseInt(digitsOnly(mdAmount), 10) } });
      setMsg({ type: 'ok', text: t('md_saved') });
      await load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  async function repayNow() {
    setMsg(null); setBusy(true);
    try {
      await api('/loans/repay', { method: 'POST', body: {} });
      setMsg({ type: 'ok', text: t('repay_done') });
      await load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">…</div>;

  const header = (
    <>
      <div className="page-eyebrow">{t('lb_eyebrow')}</div>
      <h1 className="page-title">{t('lb_title')}</h1>
      <p className="page-intro">{t('lb_intro')}</p>
    </>
  );

  if (!data.loan) {
    const pending = mine.find((l) => l.status === 'pending' || l.status === 'under_review');
    const rejected = !pending ? mine.find((l) => l.status === 'rejected') : null;
    return (
      <>
        {header}
        <div className="card">
          <div className="empty" style={{ padding: '56px 20px' }}>
            <div className="big">{t('lb_noloan_big')}</div>
            <p className="muted" style={{ maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.6 }}>{t('lb_noloan_sub')}</p>
            {pending && <div className="alert alert-ok" style={{ maxWidth: 520, margin: '0 auto 18px' }}>{t('lb_pending_note')}</div>}
            {rejected && <div className="alert alert-error" style={{ maxWidth: 520, margin: '0 auto 18px' }}>{t('lb_rejected_note')}</div>}
            <Link to="/apply" className="btn btn-primary">{t('lb_apply')}</Link>
          </div>
        </div>
      </>
    );
  }

  const { loan, outstanding, repaid, repayments, savings_balance } = data;
  const pct = Math.round((repaid / loan.amount) * 100);
  const md = loan.monthly_deduction || 0;
  const canRepay = md > 0 && savings_balance >= Math.min(md, outstanding) && outstanding > 0;

  return (
    <>
      {header}
      <div className="loan-hero owing">
        <div className="lh-label">{t('lb_outstanding')}</div>
        <div className="lh-amount">{money(outstanding)}</div>
        <div className="lh-sub">{money(repaid)} {t('lb_repaid')} {t('lb_of')} {money(loan.amount)}</div>
        <div className="loan-progress"><div className="bar" style={{ width: `${pct}%` }} /></div>
        <div className="lh-meta">
          <div className="m"><div className="v">{money(loan.amount)}</div><div className="k">{t('lb_original')}</div></div>
          <div className="m"><div className="v">{money(repaid)}</div><div className="k">{t('lb_paid')}</div></div>
          <div className="m"><div className="v">{pct}%</div><div className="k">{t('lb_repaid')}</div></div>
          <div className="m"><div className="v">{loan.reference}</div><div className="k">{t('lb_ref')}</div></div>
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-legend">{t('lb_schedule')}</div>
          {repayments.length === 0 ? <div className="empty">{t('no_tx')}</div> : (
            <table className="tx-table">
              <thead><tr><th>{t('tx_description')}</th><th>{t('submitted')}</th><th style={{ textAlign: 'right' }}>{t('tx_amount')}</th></tr></thead>
              <tbody>
                {repayments.map((r) => (
                  <tr key={r.id}>
                    <td className="tx-desc">{r.description}</td>
                    <td className="tx-date">{formatDate(r.created_at, lang)}</td>
                    <td className="amt credit">− {money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-legend">{t('md_title')}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('md_intro')}</p>
          {msg && <div className={`alert ${msg.type === 'ok' ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
          <div className="field">
            <label>{t('md_label')}</label>
            <div className="amount-wrap">
              <input className="amount" inputMode="numeric" value={mdAmount}
                onChange={(e) => setMdAmount(formatFCFA(digitsOnly(e.target.value)))} placeholder="0" />
              <span className="amount-suffix">FCFA</span>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>{t('md_hint')}</p>
          <div className="btn-row"><button className="btn btn-primary" onClick={saveMonthly} disabled={busy}>{t('md_save')}</button></div>

          <div style={{ borderTop: '1px solid var(--paper-200)', marginTop: 18, paddingTop: 16 }}>
            <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 4 }}>{t('md_current')}</div>
            <div className="mono" style={{ fontWeight: 600 }}>{md ? `${money(md)} / ${lang === 'fr' ? 'mois' : 'month'}` : t('md_none')}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('md_savings')}: {money(savings_balance)}</div>
            {md > 0 && (
              <div className="btn-row"><button className="btn btn-secondary" onClick={repayNow} disabled={busy || !canRepay}>{t('repay_now')}</button></div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
