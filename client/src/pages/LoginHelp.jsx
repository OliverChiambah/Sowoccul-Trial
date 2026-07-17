import { useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';

/**
 * Login Help (IT administrator).
 * A support tool for resolving sign-in problems for ANY user — members, staff,
 * or managers — without exposing any financial data. The admin searches by name,
 * email, or username, then can reset the user's two-factor authentication (for a
 * lost phone) or require a password change at next login. Both actions are
 * audited and notify the user. No balances, transactions, or accounts are shown
 * here, so the separation of duties (admin is walled off from members' money)
 * stays intact.
 */
export default function LoginHelp() {
  const { t, lang } = useLang();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  async function search(e) {
    if (e) e.preventDefault();
    const term = q.trim();
    if (term.length < 2) { setMsg({ ok: false, text: t('loginhelp_min') }); return; }
    setSearching(true); setMsg(null);
    try {
      const r = await api(`/admin/login-help/search?q=${encodeURIComponent(term)}`);
      setResults(r.users || []);
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    finally { setSearching(false); }
  }

  async function reset2fa(u) {
    if (busyId) return;
    if (!window.confirm(t('loginhelp_reset2fa_confirm').replace('{name}', u.full_name))) return;
    setBusyId(u.id); setMsg(null);
    try {
      await api(`/admin/login-help/${u.id}/reset-2fa`, { method: 'POST' });
      setMsg({ ok: true, text: t('loginhelp_reset2fa_done').replace('{name}', u.full_name) });
      await search();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    finally { setBusyId(null); }
  }

  async function forcePw(u) {
    if (busyId) return;
    if (!window.confirm(t('loginhelp_forcepw_confirm').replace('{name}', u.full_name))) return;
    setBusyId(u.id); setMsg(null);
    try {
      await api(`/admin/login-help/${u.id}/force-password-reset`, { method: 'POST' });
      setMsg({ ok: true, text: t('loginhelp_forcepw_done').replace('{name}', u.full_name) });
      await search();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    finally { setBusyId(null); }
  }

  async function resendVerification(u) {
    if (busyId) return;
    setBusyId(u.id); setMsg(null);
    try {
      const r = await api(`/admin/login-help/${u.id}/resend-verification`, { method: 'POST' });
      // The code/link come back once so we can read them to the member.
      setMsg({
        ok: true,
        text: t('loginhelp_resend_done').replace('{name}', u.full_name).replace('{code}', r.code),
        detail: r.link,
      });
      await search();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    finally { setBusyId(null); }
  }

  async function manualVerify(u) {
    if (busyId) return;
    if (!window.confirm(t('loginhelp_verify_confirm').replace('{name}', u.full_name))) return;
    setBusyId(u.id); setMsg(null);
    try {
      await api(`/admin/login-help/${u.id}/verify-email`, { method: 'POST' });
      setMsg({ ok: true, text: t('loginhelp_verify_done').replace('{name}', u.full_name) });
      await search();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    finally { setBusyId(null); }
  }

  const roleLabel = (role) => t('role_' + role) || role;

  return (
    <>
      <div className="page-eyebrow">{t('nav_login_help')}</div>
      <h1 className="page-title">{t('loginhelp_title')}</h1>
      <p className="page-intro">{t('loginhelp_intro')}</p>

      <div className="card" style={{ maxWidth: 680 }}>
        <form onSubmit={search} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('loginhelp_search_ph')}
            style={{ flex: 1, minWidth: 220 }}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? t('loginhelp_searching') : t('loginhelp_search')}
          </button>
        </form>

        {msg && (
          <div className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')} style={{ marginTop: 14 }}>
            <div>{msg.text}</div>
            {msg.detail && (
              <div style={{ marginTop: 8, fontSize: 12.5, wordBreak: 'break-all' }}>
                <strong>{t('loginhelp_resend_link')}:</strong> {msg.detail}
              </div>
            )}
          </div>
        )}
      </div>

      {results != null && (
        <div style={{ marginTop: 18 }}>
          {results.length === 0 ? (
            <div className="card"><div className="empty">{t('loginhelp_none')}</div></div>
          ) : (
            results.map((u) => (
              <div className="card" key={u.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 16 }}>
                      {u.full_name}
                      <span className="pill" style={{ marginLeft: 8 }}>{roleLabel(u.role)}</span>
                      {u.branch && <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{u.branch}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{u.email || u.username}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                      {u.twofa_enabled ? t('loginhelp_2fa_on') : t('loginhelp_2fa_off')}
                      {u.must_change_password ? ` · ${t('loginhelp_pw_pending')}` : ''}
                      {u.role === 'member' && (u.email_verified
                        ? ` · ${t('loginhelp_email_verified')}`
                        : ` · ${t('loginhelp_email_unverified')}`)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {u.role === 'member' && !u.email_verified && (
                      <>
                        <button className="btn btn-ghost" disabled={busyId === u.id} onClick={() => resendVerification(u)}>
                          {t('loginhelp_resend')}
                        </button>
                        <button className="btn btn-ghost" disabled={busyId === u.id} onClick={() => manualVerify(u)}>
                          {t('loginhelp_verify')}
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-ghost"
                      disabled={busyId === u.id || !u.twofa_enabled}
                      title={!u.twofa_enabled ? t('loginhelp_2fa_off') : ''}
                      onClick={() => reset2fa(u)}
                    >
                      {t('loginhelp_reset2fa')}
                    </button>
                    <button className="btn btn-ghost" disabled={busyId === u.id} onClick={() => forcePw(u)}>
                      {t('loginhelp_forcepw')}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
