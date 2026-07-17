import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { money, digitsOnly } from '../lib/format.js';

/**
 * Operational settings (admin only). For now: the maker-checker approval
 * threshold — the amount at or above which a staff-posted account entry must be
 * approved by a second person before the money moves.
 */
export default function AdminSettings() {
  const { t } = useLang();
  const { user } = useAuth();
  const isGM = user && user.role === 'manager';
  const [value, setValue] = useState('');
  const [current, setCurrent] = useState(null);
  const [require2fa, setRequire2fa] = useState('off');
  const [graceRemaining, setGraceRemaining] = useState(null);
  const [graceTotal, setGraceTotal] = useState(10);
  const [twofaMsg, setTwofaMsg] = useState(null);
  const [twofaBusy, setTwofaBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await api('/admin/settings');
      setCurrent(r.approval_threshold);
      setValue(String(r.approval_threshold));
      setRequire2fa(r.require_2fa || 'off');
      setGraceRemaining(r.member_grace_days_remaining ?? null);
      setGraceTotal(r.member_grace_days_total ?? 10);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function saveRequire2fa({ staff, members }) {
    if (twofaBusy) return;
    setTwofaBusy(true); setTwofaMsg(null);
    try {
      const r = await api('/admin/settings/require-2fa', { method: 'PUT', body: { require_staff: staff, require_members: members } });
      setRequire2fa(r.require_2fa);
      await load();
      setTwofaMsg({
        ok: true,
        text: r.self_needs_setup
          ? t('twofa_req_saved_self')
          : t('twofa_req_saved'),
      });
    } catch (e) {
      setTwofaMsg({ ok: false, text: e.message });
    } finally { setTwofaBusy(false); }
  }

  async function save() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const amt = parseInt(digitsOnly(value), 10);
      const r = await api('/admin/settings/threshold', { method: 'PUT', body: { amount: amt } });
      setCurrent(r.approval_threshold);
      setMsg({ ok: true, text: t('settings_saved') });
    } catch (e) {
      setMsg({ ok: false, text: e.fields ? Object.values(e.fields)[0] : e.message });
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-eyebrow">{t('nav_settings')}</div>
      <h1 className="page-title">{t('settings_title')}</h1>
      <p className="page-intro">{t('settings_intro')}</p>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-legend">{t('settings_threshold_legend')}</div>
        <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 14 }}>{t('settings_threshold_hint')}</p>

        {current != null && (
          <p style={{ marginBottom: 12 }}>{t('settings_threshold_current')}: <strong>{money(current)}</strong></p>
        )}

        {msg && <div className={'alert ' + (msg.ok ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}

        {isGM ? (
          <>
            <div className="field">
              <label>{t('settings_threshold_label')}</label>
              <div className="amount-wrap">
                <input value={value} onChange={(e) => setValue(digitsOnly(e.target.value))} inputMode="numeric" />
                <span className="amount-suffix">FCFA</span>
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? t('saving') : t('save')}</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>{t('settings_threshold_zero_note')}</p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{t('settings_threshold_gm_only')}</p>
        )}
      </div>

      <div className="card settings-2fa" style={{ maxWidth: 620 }}>
        <div className="card-legend">{t('settings_2fa_legend')}</div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: -6, marginBottom: 14, lineHeight: 1.55 }}>{t('settings_2fa_hint')}</p>

        {/* Live status of the current setting */}
        <div className={'settings-2fa-status level-' + require2fa}>
          <span className="dot" aria-hidden="true" />
          <div>
            <div className="settings-2fa-status-title">
              {require2fa === 'off' && t('settings_2fa_status_off')}
              {require2fa === 'staff' && t('settings_2fa_status_staff')}
              {require2fa === 'all' && t('settings_2fa_status_all')}
            </div>
            {require2fa === 'all' && graceRemaining != null && (
              <div className="settings-2fa-status-sub">
                {graceRemaining > 0
                  ? t('settings_2fa_grace_active').replace('{n}', graceRemaining).replace('{total}', graceTotal ?? 10)
                  : t('settings_2fa_grace_over')}
              </div>
            )}
          </div>
        </div>

        {twofaMsg && <div className={'alert ' + (twofaMsg.ok ? 'alert-ok' : 'alert-error')} style={{ marginTop: 14 }}>{twofaMsg.text}</div>}

        <div className="check-cards" style={{ marginTop: 14 }}>
          <label className={'check-card' + (require2fa === 'staff' || require2fa === 'all' ? ' active' : '') + (twofaBusy ? ' busy' : '')}>
            <input type="checkbox" checked={require2fa === 'staff' || require2fa === 'all'}
              onChange={(e) => saveRequire2fa({ staff: e.target.checked, members: require2fa === 'all' })} disabled={twofaBusy} />
            <span className="check-card-box" aria-hidden="true" />
            <span className="check-card-body">
              <span className="check-card-title">{t('settings_2fa_staff')}</span>
              <span className="check-card-desc">{t('settings_2fa_staff_desc')}</span>
            </span>
          </label>

          <label className={'check-card' + (require2fa === 'all' ? ' active' : '') + (twofaBusy ? ' busy' : '')}>
            <input type="checkbox" checked={require2fa === 'all'}
              onChange={(e) => saveRequire2fa({ staff: (require2fa === 'staff' || require2fa === 'all') || e.target.checked, members: e.target.checked })} disabled={twofaBusy} />
            <span className="check-card-box" aria-hidden="true" />
            <span className="check-card-body">
              <span className="check-card-title">{t('settings_2fa_members')}</span>
              <span className="check-card-desc">{t('settings_2fa_members_desc')}</span>
            </span>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>{t('settings_2fa_note')}</p>
      </div>
    </>
  );
}
