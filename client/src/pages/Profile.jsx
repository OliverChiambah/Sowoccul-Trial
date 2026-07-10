import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { money } from '../lib/format.js';

// Reviewable KYC fields the member can request corrections to (labels via i18n).
const REVIEWABLE = ['full_name', 'email', 'cni_number', 'niu', 'residential_address', 'employer', 'profession'];

/**
 * "My profile" — the member's own profile: a header with their name, role,
 * branch and membership date, then the details we hold (contact, identity/KYC),
 * their accounts, and any correction requests. Phone is self-editable; identity
 * fields are corrected by request for staff to review. Supports the data-
 * protection right to access and correct one's personal data.
 */
export default function Profile() {
  const { t } = useLang();
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [phone, setPhone] = useState('');
  const [phoneMsg, setPhoneMsg] = useState(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);

  async function load() {
    try {
      const r = await api('/me');
      setData(r);
      setPhone(r.user.phone || '');
      setNotifyEmail(r.user.notify_email !== 0);
    } catch { setData({ error: true }); }
  }
  useEffect(() => { load(); }, []);

  async function savePhone() {
    setPhoneMsg(null);
    try {
      await api('/me/contact', { method: 'PATCH', body: { phone } });
      setPhoneMsg({ ok: true, text: t('mydata_phone_saved') });
      if (refresh) refresh();
    } catch (e) { setPhoneMsg({ ok: false, text: e.message }); }
  }

  async function toggleNotify(next) {
    setNotifyEmail(next);
    try { await api('/me/notifications', { method: 'PATCH', body: { email: next } }); }
    catch { setNotifyEmail(!next); }   // revert on failure
  }

  if (!data) return <div className="loading">…</div>;
  if (data.error) return <div className="alert alert-error">{t('mydata_error')}</div>;

  const { user, accounts, corrections } = data;
  const profile = user.profile || {};
  const fieldLabel = (k) => t(`field_${k}`);
  const initials = (user.full_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const roleLabel = user.role === 'member' ? t('role_member')
    : user.role === 'admin' ? t('role_admin')
    : user.role === 'manager' ? t('role_manager')
    : t('role_staff');
  const memberId = accounts && accounts.length ? accounts[0].account_number : user.username;
  const joined = user.created_at ? String(user.created_at).slice(0, 10) : null;
  // Display rows drawn from the profile + core fields.
  const displayFields = [
    ['full_name', user.full_name],
    ['email', user.email],
    ['branch', user.branch],
    ...REVIEWABLE.filter((k) => k !== 'full_name' && k !== 'email').map((k) => [k, profile[k]]),
  ].filter(([, v]) => v != null && v !== '');

  return (
    <>
      {/* Profile header */}
      <div className="profile-header">
        <div className="profile-avatar">{initials}</div>
        <div className="profile-head-info">
          <h1 className="profile-name">{user.full_name}</h1>
          <div className="profile-badges">
            <span className="profile-badge role">{roleLabel}</span>
            {user.branch && <span className="profile-badge">{user.branch}</span>}
          </div>
          <div className="profile-meta">
            <span><span className="profile-meta-k">{t('profile_member_id')}:</span> <span className="mono">{memberId}</span></span>
            {joined && <span><span className="profile-meta-k">{t('profile_member_since')}:</span> {joined}</span>}
          </div>
        </div>
      </div>
      <p className="page-intro" style={{ marginTop: 4 }}>{t('profile_intro')}</p>

      {/* Contact details — phone is self-editable */}
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-legend">{t('mydata_contact')}</div>
        {phoneMsg && <div className={`alert ${phoneMsg.ok ? 'alert-ok' : 'alert-error'}`}>{phoneMsg.text}</div>}
        <div className="field"><label>{t('field_phone')}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>{t('mydata_phone_hint')}</p>
        <div className="btn-row"><button className="btn btn-primary" onClick={savePhone} disabled={phone === (user.phone || '')}>{t('mydata_save_phone')}</button></div>
      </div>

      {/* Notification preferences */}
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-legend">{t('notify_prefs')}</div>
        <label className="notify-toggle">
          <input type="checkbox" checked={notifyEmail} onChange={(e) => toggleNotify(e.target.checked)} />
          <span className="notify-toggle-box" aria-hidden="true" />
          <span>
            <span className="notify-toggle-title">{t('notify_email_label')}</span>
            <span className="notify-toggle-desc">{t('notify_email_desc')}</span>
          </span>
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>{t('notify_security_always')}</p>
      </div>

      {/* Identity / KYC data — view only, correction by request */}
      <div className="card">
        <div className="card-legend">{t('mydata_identity')}</div>
        <div className="grid2">
          {displayFields.map(([k, v]) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--ink-400)', fontWeight: 600 }}>{fieldLabel(k)}</div>
              <div style={{ fontSize: 14 }}>{String(v)}</div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{t('mydata_kyc_hint')}</p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => setReqOpen((v) => !v)}>{reqOpen ? t('cancel') : t('mydata_request_correction')}</button>
        </div>
        {reqOpen && <CorrectionForm user={user} profile={profile} onDone={() => { setReqOpen(false); load(); }} />}
      </div>

      {/* Existing correction requests */}
      {corrections && corrections.length > 0 && (
        <div className="card">
          <div className="card-legend">{t('mydata_requests')}</div>
          <table className="tx-table">
            <thead><tr><th>{t('mydata_req_when')}</th><th>{t('mydata_req_fields')}</th><th>{t('status')}</th></tr></thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id}>
                  <td className="tx-date">{c.created_at}</td>
                  <td>{Object.keys(c.fields).map((k) => fieldLabel(k)).join(', ')}</td>
                  <td><span className={`pill-status status-${c.status === 'applied' ? 'approved' : c.status === 'rejected' ? 'rejected' : 'pending'}`}>{t(`corr_${c.status}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Accounts snapshot */}
      <div className="card">
        <div className="card-legend">{t('mydata_accounts')}</div>
        <table className="tx-table">
          <thead><tr><th>{t('verify_account')}</th><th style={{ textAlign: 'right' }}>{t('balance')}</th></tr></thead>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={i}><td>{a.account_number} · {a.type}</td><td className="amt">{money(a.balance)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CorrectionForm({ user, profile, onDone }) {
  const { t } = useLang();
  const current = {
    full_name: user.full_name || '', email: user.email || '',
    cni_number: profile.cni_number || '', niu: profile.niu || '',
    residential_address: profile.residential_address || '', employer: profile.employer || '',
    profession: profile.profession || '',
  };
  const [vals, setVals] = useState({ ...current });
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }));

  async function submit() {
    setMsg(null); setBusy(true);
    // Only send fields that actually changed.
    const fields = {};
    for (const k of REVIEWABLE) if (vals[k] !== current[k]) fields[k] = vals[k];
    if (Object.keys(fields).length === 0) { setMsg({ ok: false, text: t('mydata_no_change') }); setBusy(false); return; }
    try {
      await api('/me/corrections', { method: 'POST', body: { fields, note } });
      setMsg({ ok: true, text: t('mydata_req_sent') });
      setTimeout(onDone, 900);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--paper-100)', paddingTop: 14 }}>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{t('mydata_req_intro')}</p>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      <div className="grid2">
        {REVIEWABLE.map((k) => (
          <div className="field" key={k}><label>{t(`field_${k}`)}</label>
            <input value={vals[k]} onChange={set(k)} /></div>
        ))}
      </div>
      <div className="field"><label>{t('mydata_req_note')}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></div>
      <div className="btn-row"><button className="btn btn-primary" onClick={submit} disabled={busy}>{t('mydata_req_submit')}</button></div>
    </div>
  );
}
