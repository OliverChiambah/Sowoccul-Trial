import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useLang } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Wordmark } from '../components/Brand.jsx';

export default function VerifyEmail() {
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenFromLink = params.get('token') || '';
  const emailFromLink = params.get('email') || '';

  const [status, setStatus] = useState(tokenFromLink ? 'checking' : 'idle'); // idle|checking|success|error
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(emailFromLink);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  // If the member arrived via the emailed link, verify the token automatically.
  useEffect(() => {
    if (!tokenFromLink) return;
    let active = true;
    (async () => {
      try {
        await api('/auth/verify-email/token', { method: 'POST', body: { token: tokenFromLink } });
        if (active) { setStatus('success'); setMessage(t('verify_ok')); }
      } catch (e) {
        if (active) { setStatus('error'); setMessage(e.message); }
      }
    })();
    return () => { active = false; };
  }, [tokenFromLink]);

  async function submitCode() {
    if (!email.trim() || code.trim().length < 6) { setMessage(t('verify_enter_both')); return; }
    setBusy(true); setMessage('');
    try {
      await api('/auth/verify-email/code', { method: 'POST', body: { email: email.trim(), code: code.trim() } });
      setStatus('success'); setMessage(t('verify_ok'));
    } catch (e) {
      setMessage(e.message);
    } finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setMessage('');
    try {
      await api('/auth/verify-email/resend', { method: 'POST', body: { email: email.trim() } });
      setResent(true); setMessage(t('verify_resent'));
    } catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }

  const success = status === 'success';

  return (
    <div className="auth-wrap">
      <div className="auth-brandside">
        <Wordmark size={46} light />
        <div><h2>{t('verify_email_title')}</h2><p>{t('verify_email_side')}</p></div>
        <div className="motto">“Serving our members since 1995.”</div>
      </div>
      <div className="auth-formside">
        <div className="auth-card">
          <div className="lang-toggle" data-lang={lang}>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          </div>

          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-700)', fontSize: 28 }}>✓</div>
              <h1 className="auth-title">{t('verify_success_title')}</h1>
              <p className="auth-sub">{t('verify_success_sub')}</p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>{t('verify_go_login')}</button>
            </div>
          ) : status === 'checking' ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div className="loading">…</div>
              <p className="auth-sub">{t('verify_checking')}</p>
            </div>
          ) : (
            <>
              <h1 className="auth-title">{t('verify_email_title')}</h1>
              <p className="auth-sub">{t('verify_email_intro')}</p>

              {message && <div className={`alert ${success ? 'alert-ok' : 'alert-error'}`} style={{ marginBottom: 14 }}>{message}</div>}

              <div className="field"><label>{t('field_email')}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.cm" /></div>

              <div className="field"><label>{t('verify_code_label')}</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  style={{ letterSpacing: '0.4em', fontFamily: 'var(--font-mono, monospace)', fontSize: 18, textAlign: 'center' }}
                /></div>

              <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy} onClick={submitCode}>
                {busy ? t('verify_checking') : t('verify_confirm_btn')}
              </button>

              <p className="auth-sub" style={{ marginTop: 16, fontSize: 13 }}>{t('verify_link_hint')}</p>

              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button className="btn btn-ghost" disabled={busy || resent} onClick={resend}>{t('verify_resend')}</button>
              </div>
              <p className="muted" style={{ marginTop: 14, textAlign: 'center' }}>
                <Link to="/login">{t('verify_back_login')}</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
