import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { useBranches } from '../context/BranchesContext.jsx';
import { readImageFile } from '../lib/imageUpload.js';

// Job titles (labels). General Manager maps to the institution-wide manager.
// Branch Manager is always an editor and is unique per branch; the others may
// hold the single "one other editor" slot.
const TITLES = [
  { key: 'general_manager', role: 'manager' },
  { key: 'branch_manager', role: 'staff', alwaysEditor: true },
  { key: 'loans_officer', role: 'staff' },
  { key: 'cashier', role: 'staff' },
  { key: 'intern', role: 'staff' },
];
const titleMeta = (key) => TITLES.find((x) => x.key === key) || { role: 'staff' };

/**
 * Admin-only console for staff and job titles.
 *  - Create staff by title (General Manager, Branch Manager, Loans Officer,
 *    Cashier, Intern). Titles are labels; the role/permissions derive from them.
 *  - Within a branch, the Branch Manager is always an editor, plus one other.
 * Every rule is enforced on the server; this UI just reflects it.
 */
export default function AdminStaff() {
  const { t } = useLang();
  const { branches, headquarters } = useBranches();
  const [staff, setStaff] = useState(null);
  const [msg, setMsg] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);

  async function load() {
    try {
      const r = await api('/admin/staff');
      setStaff(r.staff);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const titleLabel = (key) => t(`title_${key}`);
  // Count non-Branch-Manager editors in a branch (the single "other" slot).
  const otherEditors = (branch) => (staff || []).filter((s) => s.role === 'staff' && s.branch === branch && s.can_edit && s.title !== 'branch_manager').length;
  const branchHasManager = (branch) => (staff || []).some((s) => s.title === 'branch_manager' && s.branch === branch);
  const hasGM = (staff || []).some((s) => s.role === 'manager');

  async function toggleEdit(person) {
    setMsg(null);
    try {
      await api(`/admin/staff/${person.id}/edit-rights`, { method: 'PUT', body: { can_edit: person.can_edit ? 0 : 1 } });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  async function remove(person) {
    setMsg(null);
    try { await api(`/admin/staff/${person.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  async function reset2fa(person) {
    setMsg(null);
    if (!window.confirm(t('staff_reset_2fa_confirm').replace('{name}', person.full_name))) return;
    try {
      await api(`/admin/staff/${person.id}/reset-2fa`, { method: 'POST' });
      setMsg({ ok: true, text: t('staff_reset_2fa_done') });
      await load();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  if (!staff) return <div className="loading">…</div>;

  const gms = staff.filter((s) => s.role === 'manager');
  const byBranch = {};
  staff.filter((s) => s.role === 'staff').forEach((s) => { (byBranch[s.branch] = byBranch[s.branch] || []).push(s); });
  // Branch Manager first within each branch.
  Object.values(byBranch).forEach((list) => list.sort((a, b) => (b.title === 'branch_manager' ? 1 : 0) - (a.title === 'branch_manager' ? 1 : 0)));
  const branchOrder = branches.filter((b) => byBranch[b]);

  return (
    <>
      <div className="page-eyebrow">{t('staff_eyebrow')}</div>
      <h1 className="page-title">{t('staff_title')}</h1>
      <p className="page-intro">{t('staff_intro')}</p>

      {msg && !msg.ok && <div className="alert alert-error">{msg.text}</div>}

      <div className="btn-row" style={{ marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>{showCreate ? t('cancel') : `+ ${t('staff_add')}`}</button>
      </div>

      {showCreate && (
        <CreateStaff
          branches={branches}
          headquarters={headquarters}
          hasGM={hasGM}
          branchHasManager={branchHasManager}
          otherEditors={otherEditors}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {/* General Manager */}
      <div className="card">
        <div className="card-legend">{t('title_general_manager')}</div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{t('staff_gm_hint')}</p>
        {gms.length === 0
          ? <div className="empty">{t('staff_no_gm')}</div>
          : gms.map((m) => (
            <div key={m.id}>
              <div className="staff-row">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <StaffAvatar person={m} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{m.full_name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{m.employee_id ? `${m.employee_id} · ` : ''}{m.email} · {t('title_general_manager')} · {t('staff_all_branches')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setEditingId(editingId === m.id ? null : m.id)}>{t('staff_edit_profile')}</button>
                  {m.twofa_enabled ? <button className="btn btn-ghost" onClick={() => reset2fa(m)}>{t('staff_reset_2fa')}</button> : null}
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(m)}>{t('staff_remove')}</button>
                </div>
              </div>
              {editingId === m.id && <ProfileEditor person={m} onSaved={() => { setEditingId(null); load(); }} onCancel={() => setEditingId(null)} />}
            </div>
          ))}
      </div>

      {/* Staff grouped by branch */}
      {branchOrder.map((branch) => (
        <div className="card" key={branch}>
          <div className="card-legend">{branch}{branch === headquarters ? ` · ${t('headquarters')}` : ''}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>
            {branchHasManager(branch) ? t('staff_bm_present') : t('staff_bm_absent')} · {t('staff_other_editor').replace('{n}', otherEditors(branch))}
          </p>
          {byBranch[branch].map((s) => {
            const isBM = s.title === 'branch_manager';
            const atCap = !isBM && !s.can_edit && otherEditors(branch) >= 1;
            return (
              <div key={s.id}>
                <div className="staff-row">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <StaffAvatar person={s} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{s.full_name}
                        <span className="pill" style={{ marginLeft: 8 }}>{titleLabel(s.title)}</span>
                        {s.can_edit
                          ? <span className="pill pill-green" style={{ marginLeft: 6 }}>{t('staff_can_edit')}</span>
                          : <span className="pill" style={{ marginLeft: 6 }}>{t('staff_view_only')}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{s.employee_id ? `${s.employee_id} · ` : ''}{s.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => setEditingId(editingId === s.id ? null : s.id)}>{t('staff_edit_profile')}</button>
                    {s.twofa_enabled ? <button className="btn btn-ghost" onClick={() => reset2fa(s)}>{t('staff_reset_2fa')}</button> : null}
                    {isBM
                      ? <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{t('staff_bm_always')}</span>
                      : <button className="btn btn-ghost" disabled={atCap} title={atCap ? t('staff_other_cap') : ''} onClick={() => toggleEdit(s)}>
                          {s.can_edit ? t('staff_make_viewonly') : t('staff_grant_edit')}
                        </button>}
                    <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(s)}>{t('staff_remove')}</button>
                  </div>
                </div>
                {editingId === s.id && <ProfileEditor person={s} onSaved={() => { setEditingId(null); load(); }} onCancel={() => setEditingId(null)} />}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function CreateStaff({ branches, headquarters, hasGM, branchHasManager, otherEditors, onCreated }) {
  const { t } = useLang();
  const [form, setForm] = useState({ title: 'cashier', full_name: '', email: '', phone: '', branch: headquarters, password: '', can_edit: false });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const meta = titleMeta(form.title);
  const isGM = meta.role === 'manager';
  const isBM = !!meta.alwaysEditor;
  // For non-BM/non-GM titles, edit rights are the optional slot.
  const otherSlotTaken = !isGM && !isBM && otherEditors(form.branch) >= 1;
  const bmTaken = isBM && branchHasManager(form.branch);

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const body = {
        title: form.title, full_name: form.full_name, email: form.email, phone: form.phone,
        branch: isGM ? undefined : form.branch,
        password: form.password,
        can_edit: (isGM || isBM) ? 1 : (form.can_edit ? 1 : 0),
      };
      const r = await api('/admin/staff', { method: 'POST', body });
      setMsg({ ok: true, text: t('staff_created').replace('{u}', r.username) });
      setTimeout(onCreated, 700);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="card-legend">{t('staff_add')}</div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      <div className="grid2">
        <div className="field"><label>{t('staff_role')}</label>
          <select value={form.title} onChange={set('title')}>
            {TITLES.map((x) => (
              <option key={x.key} value={x.key} disabled={x.key === 'general_manager' && hasGM}>
                {t(`title_${x.key}`)}{x.key === 'general_manager' && hasGM ? ` (${t('staff_exists')})` : ''}
              </option>
            ))}
          </select></div>
        <div className="field"><label>{t('reg_surname')} &amp; {t('reg_given')}</label><input value={form.full_name} onChange={set('full_name')} /></div>
        <div className="field"><label>Email</label><input value={form.email} onChange={set('email')} placeholder="name@sowoccul.cm" /></div>
        <div className="field"><label>{t('phone')}</label><input value={form.phone} onChange={set('phone')} /></div>
        {!isGM && (
          <div className="field"><label>{t('branch')}</label>
            <select value={form.branch} onChange={set('branch')}>
              {branches.map((b) => <option key={b} value={b}>{b}{b === headquarters ? ' (HQ)' : ''}</option>)}
            </select></div>
        )}
        <div className="field"><label>{t('create_member_temp_pw')}</label><input type="text" value={form.password} onChange={set('password')} placeholder={t('create_member_temp_pw_ph')} /></div>
      </div>

      {isGM && <p className="muted" style={{ fontSize: 12.5 }}>{t('staff_gm_note')}</p>}
      {isBM && <p className="muted" style={{ fontSize: 12.5 }}>{t('staff_bm_note')}</p>}
      {bmTaken && <div className="alert alert-error" style={{ marginTop: 10 }}>{t('staff_bm_taken')}</div>}

      {!isGM && !isBM && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }}>
          <input type="checkbox" checked={form.can_edit} disabled={otherSlotTaken} onChange={(e) => setForm((f) => ({ ...f, can_edit: e.target.checked }))} style={{ width: 'auto' }} />
          {t('staff_grant_edit_now')}
        </label>
      )}
      {otherSlotTaken && form.can_edit && <div className="alert alert-error" style={{ marginTop: 10 }}>{t('staff_other_cap')}</div>}

      <div className="btn-row"><button className="btn btn-primary" onClick={submit} disabled={busy || bmTaken || (otherSlotTaken && form.can_edit)}>{t('staff_create_btn')}</button></div>
    </div>
  );
}

/** Small round avatar; shows the photo if present, else initials. */
function StaffAvatar({ person }) {
  const initials = (person.full_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (person.staff_photo) {
    return <img className="staff-avatar" src={person.staff_photo} alt="" />;
  }
  return <div className="staff-avatar staff-avatar-fallback">{initials}</div>;
}

/**
 * Admin-only editor for a staff member's profile details and photo. Role, title,
 * branch and edit rights are intentionally NOT here — those stay on their own
 * guarded, audited routes. The server re-validates everything sent here.
 */
function ProfileEditor({ person, onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    phone: person.phone || '',
    bio: person.bio || '',
    start_date: person.start_date || '',
    work_extension: person.work_extension || '',
    languages: person.languages || '',
  });
  const [photo, setPhoto] = useState(person.staff_photo || null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onPickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setMsg(null);
    try {
      const dataUrl = await readImageFile(file);
      setPhoto(dataUrl);
      setRemovePhoto(false);
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }

  async function save() {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const body = { ...form };
      if (removePhoto) body.remove_photo = true;
      else if (photo && photo !== person.staff_photo) body.photo = photo;
      await api(`/admin/staff/${person.id}/profile`, { method: 'PUT', body });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err.fields ? Object.values(err.fields)[0] : err.message });
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ background: 'var(--surface-2, #f7f9fb)', margin: '4px 0 14px' }}>
      <div className="card-legend">{t('staff_edit_profile')} — {person.full_name}</div>
      {msg && !msg.ok && <div className="alert alert-error">{msg.text}</div>}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          {photo && !removePhoto
            ? <img className="staff-avatar staff-avatar-lg" src={photo} alt="" />
            : <div className="staff-avatar staff-avatar-lg staff-avatar-fallback">{(person.full_name || '?')[0]}</div>}
          <div className="field" style={{ marginTop: 8 }}>
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
              {t('staff_photo_choose')}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} style={{ display: 'none' }} />
            </label>
            {(photo || person.staff_photo) && !removePhoto && (
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => { setRemovePhoto(true); setPhoto(null); }}>{t('staff_photo_remove')}</button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="field"><label>{t('phone')}</label><input value={form.phone} onChange={set('phone')} maxLength={30} /></div>
          <div className="field"><label>{t('staff_start_date')}</label><input type="date" value={form.start_date} onChange={set('start_date')} /></div>
          <div className="field"><label>{t('staff_work_ext')}</label><input value={form.work_extension} onChange={set('work_extension')} maxLength={20} /></div>
          <div className="field"><label>{t('staff_languages')}</label><input value={form.languages} onChange={set('languages')} maxLength={200} placeholder={t('staff_languages_ph')} /></div>
          <div className="field"><label>{t('staff_bio')}</label><textarea value={form.bio} onChange={set('bio')} maxLength={600} rows={3} /></div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? t('saving') : t('save')}</button>
        <button className="btn btn-ghost" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}
