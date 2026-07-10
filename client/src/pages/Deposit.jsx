import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { digitsOnly, formatFCFA } from '../lib/format.js';

export default function Deposit() {
  const { t } = useLang();
  const nav = useNavigate();
  const [provider, setProvider] = useState('mtn');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');

  async function onContinue() {
    // The feature is intentionally not available yet. We still call the real
    // endpoint, which responds with a "coming soon" message and moves no money.
    try {
      await api('/loans/deposit-intent', { method: 'POST', body: { provider, phone, amount: digitsOnly(amount) } });
      setNotice(t('deposit_soon'));
    } catch (e) {
      // The endpoint returns 503 with the coming-soon message.
      setNotice(e.message || t('deposit_soon'));
    }
  }

  return (
    <>
      <div className="page-eyebrow">{t('deposit_eyebrow')}</div>
      <h1 className="page-title">{t('deposit_title')}</h1>
      <p className="page-intro">{t('deposit_intro')}</p>

      <div className="card" style={{ maxWidth: 560 }}>
        {notice && (
          <div className="alert" style={{ background: 'var(--blue-50)', color: 'var(--blue-800)', border: '1px solid var(--blue-100)' }}>
            <strong>{t('deposit_soon_title')}.</strong> {notice}
          </div>
        )}
        <div className="field">
          <label>{t('deposit_provider')}</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="mtn">MTN Mobile Money</option>
            <option value="orange">Orange Money</option>
          </select>
        </div>
        <div className="field">
          <label>{t('deposit_phone')}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+237 6XX XXX XXX" />
        </div>
        <div className="field">
          <label>{t('deposit_amount')}</label>
          <div className="amount-wrap">
            <input className="amount" inputMode="numeric" value={amount}
              onChange={(e) => setAmount(formatFCFA(digitsOnly(e.target.value)))} placeholder="0" />
            <span className="amount-suffix">FCFA</span>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onContinue}>{t('deposit_continue')}</button>
          <button className="btn btn-ghost" onClick={() => nav('/dashboard')}>{t('nav_dashboard')}</button>
        </div>
      </div>
    </>
  );
}
