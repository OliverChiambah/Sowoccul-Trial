import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';
import { useLang } from '../lib/i18n.jsx';
import { money } from '../lib/format.js';

/**
 * Public page: anyone holding a printed statement can paste its verification
 * code to confirm the figures the credit union actually issued. It doesn't need
 * a login — it only reveals a summary of what was certified, keyed by the code.
 */
export default function VerifyStatement() {
  const nav = useNavigate();
  const { t } = useLang();
  const goSection = (id) => nav(`/#${id}`);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setErr(null); setResult(null);
    const c = code.trim();
    if (!c) { setErr(t('verify_enter_code')); return; }
    setBusy(true);
    try {
      const r = await api(`/content/verify/${encodeURIComponent(c)}`);
      setResult(r.statement);
    } catch (e) { setErr(e.message || t('verify_not_found')); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PublicNav onSection={goSection} />
      <section className="page-hero">
        <div className="page-hero-inner">
          <div className="sec-eyebrow">{t('verify_eyebrow')}</div>
          <h1>{t('verify_title')}</h1>
          <p>{t('verify_intro')}</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 10, maxWidth: 640, margin: '0 auto' }}>
        <div className="card">
          <div className="field">
            <label>{t('verify_code_label')}</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="STMT-XXXXXX" style={{ fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase' }} />
          </div>
          <div className="btn-row"><button className="btn btn-primary" onClick={check} disabled={busy}>{t('verify_btn')}</button></div>

          {err && <div className="alert alert-error" style={{ marginTop: 12 }}>{err}</div>}

          {result && (
            <div style={{ marginTop: 16 }}>
              <div className="alert alert-ok">{t('verify_valid')}</div>
              <div className="card-legend" style={{ marginTop: 12 }}>{t('verify_certified')}</div>
              <div style={{ fontSize: 14 }}>
                <div style={{ marginBottom: 6 }}><strong>{t('verify_member')}:</strong> {result.summary.full_name}</div>
                {result.summary.period_from && (
                  <div style={{ marginBottom: 6 }}><strong>{t('verify_period')}:</strong> {result.summary.period_from} → {result.summary.period_to}</div>
                )}
                <div style={{ marginBottom: 6 }}><strong>{t('verify_issued')}:</strong> {result.created_at}</div>
                <div style={{ marginBottom: 6 }}><strong>{t('verify_txcount')}:</strong> {result.summary.transaction_count}</div>
              </div>
              {result.summary.accounts && result.summary.accounts.length > 0 && (
                <table className="tx-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>{t('verify_account')}</th><th style={{ textAlign: 'right' }}>{t('verify_balance')}</th></tr></thead>
                  <tbody>
                    {result.summary.accounts.map((a, i) => (
                      <tr key={i}><td>{a.account_number} · {a.type}</td><td className="amt">{money(a.balance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="muted" style={{ fontSize: 12, marginTop: 10, wordBreak: 'break-all' }}>
                {t('verify_hash')}: <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{result.content_hash}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('verify_note')}</p>
            </div>
          )}
        </div>
      </section>
      <PublicFooter onSection={goSection} />
    </>
  );
}
