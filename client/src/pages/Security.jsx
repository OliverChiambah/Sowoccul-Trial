import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Security page — self-service two-factor authentication.
 * Enrolment is: begin (get secret) → scan/enter into an authenticator app →
 * confirm a code → 2FA on, recovery codes shown once. Also lets a user turn 2FA
 * off (with a code) and regenerate recovery codes.
 */
export default function Security({ forced = false }) {
  const { t } = useLang();
  const { refresh, user } = useAuth();
  const [status, setStatus] = useState(null);       // { enabled, recovery_codes_remaining }
  const [setup, setSetup] = useState(null);          // { secret, otpauth } during enrolment
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null); // shown once
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setStatus(await api('/me/2fa')); } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function begin() {
    setMsg(null); setBusy(true);
    try { setSetup(await api('/me/2fa/begin', { method: 'POST' })); setCode(''); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (busy) return;
    setMsg(null); setBusy(true);
    try {
      const r = await api('/me/2fa/confirm', { method: 'POST', body: { code: code.trim() } });
      setRecoveryCodes(r.recovery_codes);
      setSetup(null); setCode('');
      await load(); if (refresh) await refresh();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function disable() {
    if (busy) return;
    const c = window.prompt(t('twofa_disable_prompt'));
    if (c === null) return;
    setMsg(null); setBusy(true);
    try {
      await api('/me/2fa/disable', { method: 'POST', body: { code: c.trim() } });
      setRecoveryCodes(null);
      await load(); if (refresh) await refresh();
      setMsg({ ok: true, text: t('twofa_disabled_ok') });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  async function regen() {
    if (busy) return;
    const c = window.prompt(t('twofa_regen_prompt'));
    if (c === null) return;
    setMsg(null); setBusy(true);
    try {
      const r = await api('/me/2fa/recovery-codes', { method: 'POST', body: { code: c.trim() } });
      setRecoveryCodes(r.recovery_codes);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  if (!status) return <div className="loading">…</div>;

  return (
    <>
      {forced && (
        <div className="twofa-forced-bar" role="alert">
          <span>{t('twofa_forced_notice').replace('{name}', (user?.full_name || '').split(' ')[0])}</span>
        </div>
      )}

      <div className="page-eyebrow">{t('security_eyebrow')}</div>
      <h1 className="page-title">{t('security_title')}</h1>
      <p className="page-intro">{t('security_intro')}</p>

      {msg && <div className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}

      {/* Recovery codes are shown ONCE, right after enrolling or regenerating. */}
      {recoveryCodes && (
        <div className="card" style={{ borderColor: 'var(--green-700)' }}>
          <div className="card-legend">{t('twofa_recovery_title')}</div>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>{t('twofa_recovery_save')}</p>
          <div className="recovery-grid">
            {recoveryCodes.map((rc) => <code key={rc} className="recovery-code">{rc}</code>)}
          </div>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => {
              navigator.clipboard?.writeText(recoveryCodes.join('\n'));
              setMsg({ ok: true, text: t('twofa_recovery_copied') });
            }}>{t('twofa_recovery_copy')}</button>
            <button className="btn btn-primary" onClick={() => setRecoveryCodes(null)}>{t('twofa_recovery_done')}</button>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 620 }}>
        <div className="card-legend">{t('twofa_title')}</div>

        {status.enabled ? (
          <>
            <p><span className="pill pill-green">{t('twofa_on')}</span></p>
            <p className="muted" style={{ fontSize: 13.5 }}>
              {t('twofa_remaining')}: <strong>{status.recovery_codes_remaining}</strong>
              {status.recovery_codes_remaining <= 2 && <span style={{ color: 'var(--danger)' }}> — {t('twofa_low_codes')}</span>}
            </p>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={regen} disabled={busy}>{t('twofa_regen')}</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={disable} disabled={busy}>{t('twofa_turn_off')}</button>
            </div>
          </>
        ) : setup ? (
          <>
            <p style={{ fontSize: 14 }}>{t('twofa_step1')}</p>
            <p className="muted" style={{ fontSize: 13, background: 'var(--surface-2, #f6f6f6)', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>{t('twofa_fresh_scan_note')}</p>
            <ol style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: 20 }}>
              <li>{t('twofa_step_app')}</li>
              <li>{t('twofa_step_enter')}</li>
            </ol>
            <div className="field">
              <label>{t('twofa_manual_key')}</label>
              <code className="twofa-secret">{setup.secret}</code>
            </div>
            <details style={{ marginBottom: 14 }}>
              <summary className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>{t('twofa_show_uri')}</summary>
              <code style={{ fontSize: 11, wordBreak: 'break-all', display: 'block', marginTop: 6 }}>{setup.otpauth}</code>
            </details>
            <div className="field">
              <label>{t('twofa_enter_code')}</label>
              <input type="text" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={confirm} disabled={busy || code.trim().length < 6}>{busy ? t('twofa_verifying') : t('twofa_confirm')}</button>
              <button className="btn btn-ghost" onClick={() => setSetup(null)}>{t('cancel')}</button>
            </div>
          </>
        ) : (
          <>
            <p><span className="pill">{t('twofa_off')}</span></p>
            <p className="muted" style={{ fontSize: 13.5 }}>{t('twofa_off_hint')}</p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={begin} disabled={busy}>{t('twofa_setup')}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
