import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { money, digitsOnly, formatFCFA } from '../lib/format.js';
import { useAccountLabel } from '../components/ui.jsx';

export default function Transfer() {
  const { t } = useLang();
  const accLabel = useAccountLabel();

  const [accounts, setAccounts] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAccounts() {
    const { accounts } = await api('/accounts');
    setAccounts(accounts);
    if (accounts[0]) setFrom(String(accounts[0].id));
    if (accounts[1]) setTo(String(accounts[1].id));
  }
  useEffect(() => { loadAccounts(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return; // guard against double-submit while a request is in flight
    setError(''); setOk(''); setFieldErrors({});

    const amt = parseInt(digitsOnly(amount), 10);
    // Client-side checks give instant feedback; the server re-checks all of this.
    const fe = {};
    if (!amt || amt <= 0) fe.amount = t('required_field');
    if (from === to) fe.to_account_id = t('transfer_same_account');
    const fromAcc = accounts.find((a) => String(a.id) === String(from));
    if (fromAcc && amt > Number(fromAcc.balance)) fe.amount = t('transfer_insufficient');
    if (Object.keys(fe).length) { setFieldErrors(fe); return; }

    setBusy(true);
    try {
      await api('/accounts/transfer', {
        method: 'POST',
        body: { from_account_id: Number(from), to_account_id: Number(to), amount: amt, description: note },
      });
      setOk(t('transfer_done'));
      setAmount(''); setNote('');
      await loadAccounts();
    } catch (err) {
      // Surface per-field messages from the server when present.
      if (err.fields) setFieldErrors(err.fields);
      setError(err.requestId ? `${err.message} (ref: ${err.requestId})` : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-eyebrow">{t('transfer_eyebrow')}</div>
      <h1 className="page-title">{t('transfer_title')}</h1>
      <p className="page-intro">{t('transfer_intro')}</p>

      <div className="card" style={{ maxWidth: 560 }}>
        {error && <div className="alert alert-error">{error}</div>}
        {ok && <div className="alert alert-ok">{ok}</div>}

        {accounts.length < 2 ? (
          <div className="empty">{t('no_accounts_sub')}</div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label>{t('from_account')}</label>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accLabel(a.type)} · {a.account_number} — {money(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t('to_account')}</label>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accLabel(a.type)} · {a.account_number} — {money(a.balance)}
                  </option>
                ))}
              </select>
              {fieldErrors.to_account_id && <div className="field-error">{fieldErrors.to_account_id}</div>}
            </div>

            <div className="field">
              <label>{t('amount')}</label>
              <div className="amount-wrap">
                <input className="amount" inputMode="numeric" value={amount}
                  onChange={(e) => setAmount(formatFCFA(digitsOnly(e.target.value)))} placeholder="0" />
                <span className="amount-suffix">FCFA</span>
              </div>
              {fieldErrors.amount && <div className="field-error">{fieldErrors.amount}</div>}
            </div>

            <div className="field">
              <label>{t('note')}</label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </div>

            <button className="btn btn-primary" disabled={busy}>
              {busy ? t('transferring') : t('make_transfer')}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
