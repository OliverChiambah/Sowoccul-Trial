import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Wordmark } from '../components/Brand.jsx';

export default function Login() {
  const { login, complete2fa, sessionEndedReason } = useAuth();
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [c, setC] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');

  // The login page copy is admin-editable, served from the API.
  useEffect(() => {
    let active = true;
    api('/content/login').then((r) => { if (active) setC(r.data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await login(username, password);
      if (r && r.twofa_required) {
        // Password OK, but 2FA is on — show the code step.
        setChallenge(r.challenge);
      } else {
        navigate('/dashboard');
      }
    }
    catch (err) {
      if (err.code === 'email_unverified') {
        // Send them to verification with their email prefilled.
        navigate(`/verify-email?email=${encodeURIComponent(err.email || username || '')}`);
        return;
      }
      setError(err.message);
    }
    finally { setBusy(false); }
  }

  async function onSubmitCode(e) {
    e.preventDefault();
    if (busy) return;
    setError(''); setBusy(true);
    try {
      await complete2fa(challenge, code.trim());
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brandside">
        <Wordmark size={46} light />
        <div>
          <h2>{c?.side_title || 'Save regularly. Borrow wisely. Repay promptly.'}</h2>
          <p>{c?.side_text || 'Welcome back to your cooperative. Sign in to check your savings, track your loan balance and apply for credit — all in one place.'}</p>
        </div>
        <div className="motto">“Serving our members since 1995.”</div>
      </div>
      <div className="auth-formside"><div className="auth-card">
        <Link to="/" className="auth-back">← {lang === 'fr' ? "Retour à l'accueil" : 'Back to home'}</Link>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
          <div className="lang-toggle" data-lang={lang}>
            <span className="pill" />
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
          </div>
        </div>
        <h1 className="auth-title">{c?.heading || 'Welcome back'}</h1>
        <p className="auth-sub">{c?.subheading || (lang === 'fr' ? 'Connectez-vous à vos comptes et prêts.' : 'Sign in to access your accounts and loans.')}</p>
        {sessionEndedReason && !error && (
          <div className="alert alert-error">
            {sessionEndedReason === 'revoked' ? t('session_revoked_notice') : t('session_expired_notice')}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        {challenge ? (
          <form onSubmit={onSubmitCode}>
            <p style={{ fontSize: 14, color: 'var(--ink-600)', marginBottom: 14 }}>{t('twofa_login_prompt')}</p>
            <div className="field"><label>{t('twofa_code_label')}</label>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code}
                onChange={(e) => setCode(e.target.value)} required autoFocus placeholder="123456" /></div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? t('twofa_verifying') : t('twofa_verify')}</button>
            <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }}
              onClick={() => { setChallenge(null); setCode(''); setError(''); }}>{t('twofa_back')}</button>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{t('twofa_recovery_hint')}</p>
          </form>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field"><label>{c?.username_label || t('username')}</label>
              <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></div>
            <div className="field"><label>{c?.password_label || t('password')}</label>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{c?.button || t('sign_in')}</button>
          </form>
        )}
        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13.5 }}>
          <span className="muted">{c?.join_prompt || (lang === 'fr' ? 'Pas encore membre ?' : 'Not a member yet?')} </span>
          <Link to="/register" style={{ color: 'var(--green-700)', fontWeight: 600 }}>{c?.join_link || (lang === 'fr' ? 'Devenir membre' : 'Become a member')}</Link>
        </div>
      </div></div>
    </div>
  );
}
