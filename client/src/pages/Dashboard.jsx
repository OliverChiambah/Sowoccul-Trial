import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { money, formatDate } from '../lib/format.js';
import { useAccountLabel } from '../components/ui.jsx';

const CARD_COLORS = ['green', 'blue', 'navy'];

export default function Dashboard() {
  const { user } = useAuth();
  const { lang, t } = useLang();
  const accLabel = useAccountLabel();
  const nav = useNavigate();
  const [twofaPromptDismissed, setTwofaPromptDismissed] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loan, setLoan] = useState(null); // { loan, outstanding, repaid } or null
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [{ accounts }, bal] = await Promise.all([api('/accounts'), api('/loans/balance')]);
        if (!active) return;
        setAccounts(accounts);
        setLoan(bal.loan ? bal : null);
        if (accounts.length) {
          const { transactions } = await api(`/accounts/${accounts[0].id}/transactions`);
          if (active) setRecent(transactions.slice(0, 5));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  if (loading) return <div className="loading">…</div>;

  return (
    <>
      <div className="page-eyebrow">{t('dash_eyebrow')}</div>
      <h1 className="page-title">{t('dash_title')}, {user.full_name.split(' ')[0]}</h1>
      <p className="page-intro">{t('dash_intro')}</p>

      {user.role === 'member' && user.review_status === 'pending_review' && (
        <div className="alert" style={{ background: 'var(--amber-light)', color: 'var(--amber)', border: '1px solid rgba(183,121,31,0.25)' }}>
          <strong>{t('dash_pending_title')}</strong> {t('dash_pending_text')}
        </div>
      )}

      {user.twofa_setup_required && !user.twofa_setup_forced && !twofaPromptDismissed && (
        <div className="twofa-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="twofaModalTitle">
          <div className="twofa-modal">
            <div className="twofa-modal-icon" aria-hidden="true">🔒</div>
            <h2 id="twofaModalTitle" className="twofa-modal-title">{t('twofa_banner_title')}</h2>
            <p className="twofa-modal-text">{t('twofa_banner_text')}</p>
            {typeof user.twofa_grace_days === 'number' && (
              <p className="twofa-modal-days">
                {user.twofa_grace_days > 0
                  ? t('twofa_banner_days').replace('{n}', user.twofa_grace_days)
                  : t('twofa_banner_last_day')}
              </p>
            )}
            <div className="twofa-modal-actions">
              <button className="btn btn-danger" onClick={() => nav('/account/security')}>{t('twofa_banner_cta')}</button>
              <button className="btn btn-ghost" onClick={() => setTwofaPromptDismissed(true)}>{t('twofa_modal_dismiss')}</button>
            </div>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card"><div className="empty"><div className="big">{t('no_accounts')}</div></div></div>
      ) : (
        <>
          <div className="account-grid">
            {accounts.map((a, i) => (
              <div key={a.id} className={`account-card ${CARD_COLORS[i % 3]}`}>
                <div className="type">{accLabel(a.type)}</div>
                <div className="num">{a.account_number}</div>
                <div className="bal">{money(a.balance)}</div>
              </div>
            ))}
            {loan ? (
              <div className="account-card navy" style={{ cursor: 'pointer' }} onClick={() => nav('/loan-balance')}>
                <div className="type">{t('nav_loanbal')}</div>
                <div className="num">{loan.loan.reference}</div>
                <div className="bal">{money(loan.outstanding)}</div>
                <div className="sub">{t('lb_of')} {money(loan.loan.amount)} · {Math.round((loan.repaid / loan.loan.amount) * 100)}% {t('lb_repaid')}</div>
              </div>
            ) : (
              <div className="account-card" style={{ background: 'linear-gradient(140deg,#5A6862,#33403A)', cursor: 'pointer' }} onClick={() => nav('/loan-balance')}>
                <div className="type">{t('nav_loanbal')}</div>
                <div className="bal" style={{ fontSize: 22 }}>{t('lb_noloan_big')}</div>
                <div className="sub">{t('lb_apply')} →</div>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="card-legend" style={{ border: 'none', marginBottom: 4 }}>{t('recent_activity')}</div>
              <span className="muted mono" style={{ fontSize: 13 }}>{t('total_balance')}: {money(total)}</span>
            </div>
            {recent.length === 0 ? <div className="empty">{t('no_tx')}</div> : (
              <table className="tx-table">
                <thead><tr><th>{t('tx_description')}</th><th style={{ textAlign: 'right' }}>{t('tx_amount')}</th></tr></thead>
                <tbody>
                  {recent.map((tx) => (
                    <tr key={tx.id}>
                      <td><div className="tx-desc">{tx.description || '—'}</div><div className="tx-date">{formatDate(tx.created_at, lang)}</div></td>
                      <td className={`amt ${tx.amount >= 0 ? 'credit' : 'debit'}`}>{tx.amount >= 0 ? '+' : '−'} {money(Math.abs(tx.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="btn-row">
              <Link to="/deposit" className="btn btn-ghost">{t('nav_deposit')}</Link>
              <Link to="/transfer" className="btn btn-ghost">{t('nav_transfer')}</Link>
              <Link to="/apply" className="btn btn-primary">{t('nav_apply')}</Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
