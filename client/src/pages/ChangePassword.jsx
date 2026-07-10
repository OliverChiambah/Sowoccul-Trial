import { useState } from 'react';
import { api, setToken } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';

/**
 * Lets a signed-in user change their own password. When `forced` is true (an
 * admin-created staff member on first login), it fills the whole screen and
 * there's no way past it until the password is changed.
 */
export default function ChangePassword({ forced = false }) {
  const { t } = useLang();
  const { refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return; // guard double-submit
    setMsg(null);
    if (next.length < 8) { setMsg({ ok: false, text: t('pw_too_short') }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: t('pw_mismatch') }); return; }
    setBusy(true);
    try {
      const res = await api('/auth/change-password', { method: 'POST', body: { current_password: current, new_password: next } });
      // The server ends all other sessions and issues a fresh token for THIS
      // one; store it so we stay signed in on this device.
      if (res?.token) setToken(res.token);
      setMsg({ ok: true, text: t('pw_changed') });
      setCurrent(''); setNext(''); setConfirm('');
      // Re-fetch the user so must_change_password clears and the app unlocks.
      if (refresh) await refresh();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <div style={forced ? { maxWidth: 460, margin: '40px auto' } : undefined}>
      <div className="page-eyebrow">{t('pw_eyebrow')}</div>
      <h1 className="page-title">{t('pw_title')}</h1>
      <p className="page-intro">{forced ? t('pw_forced_intro') : t('pw_intro')}</p>

      <div className="card" style={{ maxWidth: 460 }}>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
        <div className="field"><label>{t('pw_current')}</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></div>
        <div className="field"><label>{t('pw_new')}</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></div>
        <div className="field"><label>{t('pw_confirm')}</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></div>
        <div className="btn-row"><button className="btn btn-primary" onClick={submit} disabled={busy}>{t('pw_submit')}</button></div>
      </div>
    </div>
  );
}
