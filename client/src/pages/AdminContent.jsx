import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { useBranches } from '../context/BranchesContext.jsx';

/**
 * Admin editor for the whole public website: landing text + rotating hero
 * images, team names + photos, job postings, contact details, and branches.
 * Everything writes to the database via the API, so the public site updates
 * with no code changes.
 */
export default function AdminContent() {
  const { t } = useLang();
  const [tab, setTab] = useState('landing');
  const tabs = [
    ['landing', t('content_landing')],
    ['pages', t('content_auth_pages')],
    ['team', t('content_team')],
    ['board', t('content_board')],
    ['careers', t('content_careers')],
    ['contact', t('content_contact')],
    ['branches', t('content_branches')],
    ['legal', t('content_legal')],
  ];
  return (
    <>
      <div className="page-eyebrow">{t('content_eyebrow')}</div>
      <h1 className="page-title">{t('content_title')}</h1>
      <p className="page-intro">{t('content_intro')}</p>

      <div className="stepper" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
        {tabs.map(([k, label]) => (
          <button key={k} className={'step-chip' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'landing' && <LandingEditor />}
      {tab === 'pages' && <AuthPagesEditor />}
      {tab === 'team' && <TeamEditor />}
      {tab === 'board' && <BoardEditor />}
      {tab === 'careers' && <CareersEditor />}
      {tab === 'contact' && <ContactEditor />}
      {tab === 'branches' && <BranchesEditor />}
      {tab === 'legal' && <LegalEditor />}
    </>
  );
}

/* Reads a file, uploads it as a base64 data URL, returns the new image id. */
async function uploadImage(file, purpose) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const res = await api('/admin/images', { method: 'POST', body: { data_url: dataUrl, purpose } });
  return res.id;
}

function useSection(section) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/admin/content/${section}`).then((r) => { if (active) setData(r.data); }).catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [section]);
  async function save(payload) {
    setBusy(true); setMsg(null);
    try {
      const r = await api(`/admin/content/${section}`, { method: 'PUT', body: { data: payload } });
      setData(r.data); setMsg({ ok: true });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }
  return { data, setData, save, msg, busy };
}

function SaveBar({ msg, busy, onSave }) {
  const { t } = useLang();
  return (
    <div className="btn-row" style={{ alignItems: 'center' }}>
      <button className="btn btn-primary" onClick={onSave} disabled={busy}>{t('content_save')}</button>
      {msg?.ok && <span className="muted" style={{ color: 'var(--green-700)' }}>✓ {t('content_saved')}</span>}
      {msg && !msg.ok && <span className="muted" style={{ color: 'var(--danger)' }}>{msg.text}</span>}
    </div>
  );
}

/* Small photo control: current image or placeholder, with Upload / Remove. */
function PhotoField({ value, onChange, purpose = 'team' }) {
  const { t } = useLang();
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { const id = await uploadImage(file, purpose); onChange(id); }
    catch (err) { alert(err.message); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', background: 'var(--paper-100)', border: '1px solid var(--line)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {value ? <img src={`/api/content/images/${value}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--ink-400)" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>}
      </div>
      <div>
        <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
        <button className="btn btn-ghost" style={{ padding: '6px 12px' }} disabled={busy} onClick={() => ref.current?.click()}>{busy ? '…' : t('content_upload_photo')}</button>
        {value && <button className="btn btn-ghost" style={{ padding: '6px 12px', color: 'var(--danger)' }} onClick={() => onChange('')}>{t('content_remove_photo')}</button>}
      </div>
    </div>
  );
}

/* ── Landing editor: hero text + rotating images + about text ─────────────── */
function LandingEditor() {
  const { t } = useLang();
  const { data, setData, save, msg, busy } = useSection('landing');
  const ref = useRef();
  const [uploading, setUploading] = useState(false);
  if (!data) return <div className="loading">…</div>;

  const set = (k) => (e) => setData({ ...data, [k]: e.target.value });
  const heroImages = data.hero_images || [];

  async function addHero(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { const id = await uploadImage(file, 'hero'); setData({ ...data, hero_images: [...heroImages, id] }); }
    catch (err) { alert(err.message); }
    finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  }
  const removeHero = (id) => setData({ ...data, hero_images: heroImages.filter((x) => x !== id) });

  return (
    <div className="card">
      <div className="card-legend">{t('content_hero')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_hero_hint')}</p>
      <div className="field"><label>{t('content_hero_eyebrow')}</label><input value={data.hero_eyebrow || ''} onChange={set('hero_eyebrow')} /></div>
      <div className="grid2">
        <div className="field"><label>{t('content_hero_line')} 1</label><input value={data.hero_title_1 || ''} onChange={set('hero_title_1')} /></div>
        <div className="field"><label>{t('content_hero_line')} 2</label><input value={data.hero_title_2 || ''} onChange={set('hero_title_2')} /></div>
        <div className="field"><label>{t('content_hero_line')} 3</label><input value={data.hero_title_3 || ''} onChange={set('hero_title_3')} /></div>
      </div>
      <div className="field"><label>{t('content_hero_lede')}</label><textarea rows={3} value={data.hero_lede || ''} onChange={set('hero_lede')} /></div>

      <div className="card-legend" style={{ marginTop: 8 }}>{t('content_hero_images')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{t('content_hero_images_hint')}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {heroImages.map((id) => (
          <div key={id} style={{ position: 'relative', width: 120, height: 84, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <img src={`/api/content/images/${id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={() => removeHero(id)} title={t('content_remove_photo')}
              style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        ))}
        {heroImages.length === 0 && <div className="muted" style={{ fontSize: 13 }}>{t('content_hero_none')}</div>}
      </div>
      <input ref={ref} type="file" accept="image/*" onChange={addHero} style={{ display: 'none' }} />
      <button className="btn btn-secondary" disabled={uploading} onClick={() => ref.current?.click()}>{uploading ? '…' : `+ ${t('content_add_image')}`}</button>

      <div className="card-legend" style={{ marginTop: 16 }}>{t('content_about')}</div>
      <div className="field"><label>{t('content_about_eyebrow')}</label><input value={data.about_eyebrow || ''} onChange={set('about_eyebrow')} /></div>
      <div className="field"><label>{t('content_about_title')}</label><input value={data.about_title || ''} onChange={set('about_title')} /></div>
      <div className="field"><label>{t('content_about_p1')}</label><textarea rows={3} value={data.about_p1 || ''} onChange={set('about_p1')} /></div>
      <div className="field"><label>{t('content_about_p2')}</label><textarea rows={2} value={data.about_p2 || ''} onChange={set('about_p2')} /></div>
      <div className="field"><label>{t('content_motto')}</label><input value={data.motto || ''} onChange={set('motto')} /></div>

      <div className="card-legend" style={{ marginTop: 16 }}>{t('content_hero_cta')}</div>
      <div className="grid2">
        <div className="field"><label>{t('content_cta_primary')}</label><input value={data.hero_cta_primary || ''} onChange={set('hero_cta_primary')} /></div>
        <div className="field"><label>{t('content_cta_secondary')}</label><input value={data.hero_cta_secondary || ''} onChange={set('hero_cta_secondary')} /></div>
      </div>
      <ListEditor label={t('content_hero_trust')} items={data.hero_trust || []} fields={[['num', t('content_stat_number')], ['lbl', t('content_stat_label')]]}
        onChange={(items) => setData({ ...data, hero_trust: items })} />

      <div className="card-legend" style={{ marginTop: 16 }}>{t('content_services')}</div>
      <div className="field"><label>{t('content_sec_eyebrow')}</label><input value={data.services_eyebrow || ''} onChange={set('services_eyebrow')} /></div>
      <div className="field"><label>{t('content_sec_title')}</label><input value={data.services_title || ''} onChange={set('services_title')} /></div>
      <div className="field"><label>{t('content_sec_sub')}</label><textarea rows={2} value={data.services_sub || ''} onChange={set('services_sub')} /></div>
      <ListEditor label={t('content_service_cards')} items={data.services || []} fields={[['title', t('content_card_title')], ['body', t('content_card_body')]]}
        onChange={(items) => setData({ ...data, services: items })} bodyMultiline />

      <div className="card-legend" style={{ marginTop: 16 }}>{t('content_why')}</div>
      <div className="field"><label>{t('content_sec_eyebrow')}</label><input value={data.why_eyebrow || ''} onChange={set('why_eyebrow')} /></div>
      <div className="field"><label>{t('content_sec_title')}</label><input value={data.why_title || ''} onChange={set('why_title')} /></div>
      <ListEditor label={t('content_why_items')} items={data.why_items || []} fields={[['title', t('content_card_title')], ['body', t('content_card_body')]]}
        onChange={(items) => setData({ ...data, why_items: items })} bodyMultiline />

      <div className="card-legend" style={{ marginTop: 16 }}>{t('content_stats')}</div>
      <ListEditor label={t('content_stats')} items={data.stats || []} fields={[['n', t('content_stat_number')], ['l', t('content_stat_label')]]}
        onChange={(items) => setData({ ...data, stats: items })} />

      <div className="card-legend" style={{ marginTop: 16 }}>{t('content_cta_band')}</div>
      <div className="field"><label>{t('content_cta_title')}</label><input value={data.cta_title || ''} onChange={set('cta_title')} /></div>
      <div className="field"><label>{t('content_cta_text')}</label><textarea rows={2} value={data.cta_text || ''} onChange={set('cta_text')} /></div>
      <div className="grid2">
        <div className="field"><label>{t('content_cta_primary')}</label><input value={data.cta_primary || ''} onChange={set('cta_primary')} /></div>
        <div className="field"><label>{t('content_cta_secondary')}</label><input value={data.cta_secondary || ''} onChange={set('cta_secondary')} /></div>
      </div>

      <SaveBar msg={msg} busy={busy} onSave={() => save(data)} />
    </div>
  );
}

/**
 * Reusable editor for an array of objects (services, why-items, stats, trust).
 * Each item has the given fields; the admin can edit, add, remove, and reorder.
 */
function ListEditor({ label, items, fields, onChange, bodyMultiline = false }) {
  const { t } = useLang();
  const list = Array.isArray(items) ? items : [];
  const setItem = (i, key, val) => onChange(list.map((it, idx) => idx === i ? { ...it, [key]: val } : it));
  const add = () => onChange([...list, Object.fromEntries(fields.map(([k]) => [k, '']))]);
  const remove = (i) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const copy = list.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  return (
    <div className="list-editor">
      {list.map((it, i) => (
        <div key={i} className="list-item">
          <div className="list-item-fields">
            {fields.map(([key, flabel], fi) => (
              <div className="field" key={key} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12 }}>{flabel}</label>
                {bodyMultiline && fi === fields.length - 1
                  ? <textarea rows={2} value={it[key] || ''} onChange={(e) => setItem(i, key, e.target.value)} />
                  : <input value={it[key] || ''} onChange={(e) => setItem(i, key, e.target.value)} />}
              </div>
            ))}
          </div>
          <div className="list-item-actions">
            <button className="btn btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
            <button className="btn btn-ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1} title="Move down">↓</button>
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(i)}>{t('content_remove')}</button>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary" onClick={add}>+ {t('content_add_item')}</button>
    </div>
  );
}

/* ── Team editor: names + photos ─────────────────────────────────────────── */
function TeamEditor() {
  const { t } = useLang();
  const { data, setData, save, msg, busy } = useSection('team');
  if (!data) return <div className="loading">…</div>;

  const setPres = (patch) => setData({ ...data, president: { ...data.president, ...patch } });
  const setGm = (patch) => setData({ ...data, gm: { ...data.gm, ...patch } });
  const setMgr = (i, patch) => setData({ ...data, managers: data.managers.map((m, j) => j === i ? { ...m, ...patch } : m) });

  return (
    <div className="card">
      <div className="card-legend">{t('content_team')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_team_hint')}</p>

      <div className="grid2">
        <div className="field"><label>{data.president?.role || 'President'}</label>
          <input value={data.president?.name || ''} onChange={(e) => setPres({ name: e.target.value })} placeholder={t('content_name_ph')} />
          <div style={{ marginTop: 8 }}><PhotoField value={data.president?.photo || ''} onChange={(id) => setPres({ photo: id })} /></div></div>
        <div className="field"><label>{data.gm?.role || 'General Manager'}</label>
          <input value={data.gm?.name || ''} onChange={(e) => setGm({ name: e.target.value })} placeholder={t('content_name_ph')} />
          <div style={{ marginTop: 8 }}><PhotoField value={data.gm?.photo || ''} onChange={(id) => setGm({ photo: id })} /></div></div>
      </div>

      <div className="card-legend" style={{ marginTop: 8 }}>{t('content_branch_managers')}</div>
      <div className="grid2">
        {(data.managers || []).map((m, i) => (
          <div className="field" key={m.branch || i}><label>{m.branch}</label>
            <input value={m.name || ''} onChange={(e) => setMgr(i, { name: e.target.value })} placeholder={t('content_name_ph')} />
            <div style={{ marginTop: 8 }}><PhotoField value={m.photo || ''} onChange={(id) => setMgr(i, { photo: id })} /></div></div>
        ))}
      </div>
      <SaveBar msg={msg} busy={busy} onSave={() => save(data)} />
    </div>
  );
}

/* ── Board of Directors editor ───────────────────────────────────────────── */
function BoardEditor() {
  const { t } = useLang();
  const { data, setData, save, msg, busy } = useSection('board');
  if (!data) return <div className="loading">…</div>;

  const setChair = (patch) => setData({ ...data, chair: { ...data.chair, ...patch } });
  const setDir = (i, patch) => setData({ ...data, directors: (data.directors || []).map((d, j) => j === i ? { ...d, ...patch } : d) });
  const addDir = () => setData({ ...data, directors: [...(data.directors || []), { name: '', role: 'Director', photo: '' }] });
  const removeDir = (i) => setData({ ...data, directors: (data.directors || []).filter((_, j) => j !== i) });

  return (
    <div className="card">
      <div className="card-legend">{t('content_board')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_board_hint')}</p>

      <div className="field">
        <label>{t('content_board_chair')}</label>
        <input value={data.chair?.role || ''} onChange={(e) => setChair({ role: e.target.value })} placeholder={t('content_board_role_ph')} style={{ marginBottom: 8 }} />
        <input value={data.chair?.name || ''} onChange={(e) => setChair({ name: e.target.value })} placeholder={t('content_name_ph')} />
        <div style={{ marginTop: 8 }}><PhotoField value={data.chair?.photo || ''} onChange={(id) => setChair({ photo: id })} /></div>
      </div>

      <div className="card-legend" style={{ marginTop: 8 }}>{t('content_board_directors')}</div>
      <div className="grid2">
        {(data.directors || []).map((d, i) => (
          <div className="field" key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
            <input value={d.role || ''} onChange={(e) => setDir(i, { role: e.target.value })} placeholder={t('content_board_role_ph')} style={{ marginBottom: 8 }} />
            <input value={d.name || ''} onChange={(e) => setDir(i, { name: e.target.value })} placeholder={t('content_name_ph')} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <PhotoField value={d.photo || ''} onChange={(id) => setDir(i, { photo: id })} />
              <button className="btn btn-ghost" style={{ padding: '6px 12px', color: 'var(--danger)' }} onClick={() => removeDir(i)}>{t('content_board_remove')}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-ghost" onClick={addDir}>{t('content_board_add')}</button>
      </div>
      <SaveBar msg={msg} busy={busy} onSave={() => save(data)} />
    </div>
  );
}

/* ── Careers editor ──────────────────────────────────────────────────────── */
function CareersEditor() {
  const { t } = useLang();
  const { branches: BRANCHES } = useBranches();
  const { data, setData, save, msg, busy } = useSection('careers');
  if (!data) return <div className="loading">…</div>;

  const openings = data.openings || [];
  const setJob = (i, field, v) => setData({ ...data, openings: openings.map((o, j) => j === i ? { ...o, [field]: v } : o) });
  const addJob = () => setData({ ...data, openings: [...openings, { title: '', branch: BRANCHES[0] || '', type: 'Full-time', body: '' }] });
  const removeJob = (i) => setData({ ...data, openings: openings.filter((_, j) => j !== i) });

  return (
    <div className="card">
      <div className="card-legend">{t('content_careers')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_careers_hint')}</p>
      <div className="field"><label>{t('content_apply_email')}</label>
        <input value={data.email || ''} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="careers@yourdomain.cm" /></div>
      {openings.length === 0 && <div className="empty" style={{ marginBottom: 12 }}>{t('content_no_jobs')}</div>}
      {openings.map((job, i) => (
        <div key={i} style={{ border: '1px solid var(--paper-200)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div className="grid2">
            <div className="field"><label>{t('content_job_title')}</label><input value={job.title || ''} onChange={(e) => setJob(i, 'title', e.target.value)} /></div>
            <div className="field"><label>{t('branch')}</label>
              <select value={job.branch || ''} onChange={(e) => setJob(i, 'branch', e.target.value)}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select></div>
            <div className="field"><label>{t('content_job_type')}</label>
              <select value={job.type || 'Full-time'} onChange={(e) => setJob(i, 'type', e.target.value)}>
                <option value="Full-time">{t('content_fulltime')}</option>
                <option value="Internship">{t('content_internship')}</option>
              </select></div>
          </div>
          <div className="field"><label>{t('content_job_desc')}</label><textarea rows={2} value={job.body || ''} onChange={(e) => setJob(i, 'body', e.target.value)} /></div>
          <button className="btn btn-ghost" onClick={() => removeJob(i)} style={{ color: 'var(--danger)' }}>{t('content_remove_job')}</button>
        </div>
      ))}
      <div className="btn-row"><button className="btn btn-secondary" onClick={addJob}>+ {t('content_add_job')}</button></div>
      <SaveBar msg={msg} busy={busy} onSave={() => save(data)} />
    </div>
  );
}

/* ── Contact editor ──────────────────────────────────────────────────────── */
/* ── Login + Become-a-member page text ───────────────────────────────────── */
function AuthPagesEditor() {
  const { t } = useLang();
  const login = useSection('login');
  const register = useSection('register');
  if (!login.data || !register.data) return <div className="loading">…</div>;

  const setL = (k) => (e) => login.setData({ ...login.data, [k]: e.target.value });
  const setR = (k) => (e) => register.setData({ ...register.data, [k]: e.target.value });
  const L = login.data, R = register.data;

  return (
    <>
      <div className="card">
        <div className="card-legend">{t('content_login_page')}</div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_login_hint')}</p>
        <div className="grid2">
          <div className="field"><label>{t('content_heading')}</label><input value={L.heading || ''} onChange={setL('heading')} /></div>
          <div className="field"><label>{t('content_button_label')}</label><input value={L.button || ''} onChange={setL('button')} /></div>
        </div>
        <div className="field"><label>{t('content_subheading')}</label><textarea rows={2} value={L.subheading || ''} onChange={setL('subheading')} /></div>
        <div className="grid2">
          <div className="field"><label>{t('content_username_label')}</label><input value={L.username_label || ''} onChange={setL('username_label')} /></div>
          <div className="field"><label>{t('content_password_label')}</label><input value={L.password_label || ''} onChange={setL('password_label')} /></div>
        </div>
        <div className="card-legend" style={{ marginTop: 8 }}>{t('content_side_panel')}</div>
        <div className="field"><label>{t('content_side_title')}</label><input value={L.side_title || ''} onChange={setL('side_title')} /></div>
        <div className="field"><label>{t('content_side_text')}</label><textarea rows={2} value={L.side_text || ''} onChange={setL('side_text')} /></div>
        <div className="grid2">
          <div className="field"><label>{t('content_join_prompt')}</label><input value={L.join_prompt || ''} onChange={setL('join_prompt')} /></div>
          <div className="field"><label>{t('content_join_link')}</label><input value={L.join_link || ''} onChange={setL('join_link')} /></div>
        </div>
        <SaveBar msg={login.msg} busy={login.busy} onSave={() => login.save(L)} />
      </div>

      <div className="card">
        <div className="card-legend">{t('content_register_page')}</div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_register_hint')}</p>
        <div className="grid2">
          <div className="field"><label>{t('content_heading')}</label><input value={R.heading || ''} onChange={setR('heading')} /></div>
          <div className="field"><label>{t('content_button_label')}</label><input value={R.button || ''} onChange={setR('button')} /></div>
        </div>
        <div className="field"><label>{t('content_subheading')}</label><textarea rows={2} value={R.subheading || ''} onChange={setR('subheading')} /></div>
        <div className="card-legend" style={{ marginTop: 8 }}>{t('content_side_panel')}</div>
        <div className="field"><label>{t('content_side_title')}</label><input value={R.side_title || ''} onChange={setR('side_title')} /></div>
        <div className="field"><label>{t('content_side_text')}</label><textarea rows={2} value={R.side_text || ''} onChange={setR('side_text')} /></div>
        <div className="grid2">
          <div className="field"><label>{t('content_login_prompt')}</label><input value={R.login_prompt || ''} onChange={setR('login_prompt')} /></div>
          <div className="field"><label>{t('content_login_link')}</label><input value={R.login_link || ''} onChange={setR('login_link')} /></div>
        </div>
        <SaveBar msg={register.msg} busy={register.busy} onSave={() => register.save(R)} />
      </div>
    </>
  );
}

function ContactEditor() {
  const { t } = useLang();
  const { data, setData, save, msg, busy } = useSection('contact');
  if (!data) return <div className="loading">…</div>;
  const set = (field) => (e) => setData({ ...data, [field]: e.target.value });
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-legend">{t('content_contact')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_contact_hint')}</p>
      <div className="field"><label>{t('content_address')}</label><input value={data.address || ''} onChange={set('address')} /></div>
      <div className="field"><label>{t('content_phone')}</label><input value={data.phone || ''} onChange={set('phone')} /></div>
      <div className="field"><label>{t('content_email')}</label><input value={data.email || ''} onChange={set('email')} /></div>
      <div className="field"><label>{t('content_hours')}</label><input value={data.hours || ''} onChange={set('hours')} /></div>
      <SaveBar msg={msg} busy={busy} onSave={() => save(data)} />
    </div>
  );
}

/* ── Branches editor: add / edit / rename / delete ───────────────────────── */
function BranchesEditor() {
  const { t } = useLang();
  const { refresh } = useBranches();
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    try { const r = await api('/admin/branches'); setRows(r.branches); } catch { setRows([]); }
  }
  useEffect(() => { load(); }, []);

  async function saveRow(row) {
    setMsg(null);
    try {
      if (row.id) await api(`/admin/branches/${row.id}`, { method: 'PUT', body: row });
      else await api('/admin/branches', { method: 'POST', body: row });
      await load(); await refresh(); setMsg({ ok: true });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  async function del(id) {
    setMsg(null);
    try { await api(`/admin/branches/${id}`, { method: 'DELETE' }); await load(); await refresh(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  }

  if (!rows) return <div className="loading">…</div>;

  return (
    <div className="card">
      <div className="card-legend">{t('content_branches')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('content_branches_hint')}</p>
      {msg?.ok && <div className="alert alert-ok">✓ {t('content_saved')}</div>}
      {msg && !msg.ok && <div className="alert alert-error">{msg.text}</div>}
      {rows.map((b) => <BranchRow key={b.id} branch={b} onSave={saveRow} onDelete={() => del(b.id)} />)}
      <BranchRow branch={{ name: '', is_hq: 0, address: '', phone: '', email: '', manager_name: '' }} isNew onSave={saveRow} />
    </div>
  );
}

function OfficePhoto({ value, onChange }) {
  const { t } = useLang();
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { const id = await uploadImage(file, 'branch'); onChange(id); }
    catch (err) { alert(err.message); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  }
  return (
    <div className="field">
      <label>{t('content_office_photo')}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 108, height: 72, borderRadius: 10, overflow: 'hidden', background: 'var(--paper-100)', border: '1px solid var(--line)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {value ? <img src={`/api/content/images/${value}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--ink-400)" strokeWidth="1.4"><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-6h6v6" /></svg>}
        </div>
        <div>
          <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} disabled={busy} onClick={() => ref.current?.click()}>{busy ? '…' : t('content_upload_photo')}</button>
          {value && <button className="btn btn-ghost" style={{ padding: '6px 12px', color: 'var(--danger)' }} onClick={() => onChange('')}>{t('content_remove_photo')}</button>}
        </div>
      </div>
    </div>
  );
}

function BranchRow({ branch, onSave, onDelete, isNew }) {
  const { t } = useLang();
  const [b, setB] = useState(branch);
  const set = (k) => (e) => setB({ ...b, [k]: e.target.value });
  return (
    <div style={{ border: '1px solid var(--paper-200)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div className="grid2">
        <div className="field"><label>{t('content_branch_name')}</label><input value={b.name || ''} onChange={set('name')} placeholder={isNew ? t('content_new_branch') : ''} /></div>
        <div className="field"><label>{t('content_branch_manager')}</label><input value={b.manager_name || ''} onChange={set('manager_name')} /></div>
        <div className="field"><label>{t('content_address')}</label><input value={b.address || ''} onChange={set('address')} /></div>
        <div className="field"><label>{t('content_phone')}</label><input value={b.phone || ''} onChange={set('phone')} /></div>
        <div className="field"><label>{t('content_email')}</label><input value={b.email || ''} onChange={set('email')} /></div>
        <div className="field"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!b.is_hq} onChange={(e) => setB({ ...b, is_hq: e.target.checked ? 1 : 0 })} style={{ width: 'auto' }} />
          {t('content_is_hq')}</label></div>
      </div>
      <div className="field"><label>{t('content_branch_desc')}</label><textarea rows={2} value={b.description || ''} onChange={set('description')} placeholder={t('content_branch_desc_ph')} /></div>
      <OfficePhoto value={b.office_photo || ''} onChange={(id) => setB({ ...b, office_photo: id })} />
      <div className="btn-row">
        <button className="btn btn-primary" style={{ padding: '7px 16px' }} onClick={() => onSave(b)}>{isNew ? `+ ${t('content_add_branch')}` : t('content_save')}</button>
        {!isNew && <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={onDelete}>{t('content_delete_branch')}</button>}
      </div>
    </div>
  );
}

/* ── Legal editor: Privacy Policy + Terms of Service (bilingual) ──────────── */
function LegalEditor() {
  const { t } = useLang();
  const [which, setWhich] = useState('privacy');
  return (
    <>
      <div className="stepper" style={{ marginBottom: 14 }}>
        <button className={'step-chip' + (which === 'privacy' ? ' active' : '')} onClick={() => setWhich('privacy')}>{t('nav_privacy')}</button>
        <button className={'step-chip' + (which === 'terms' ? ' active' : '')} onClick={() => setWhich('terms')}>{t('nav_terms')}</button>
      </div>
      <LegalSectionEditor key={which} section={which} />
    </>
  );
}

function LegalSectionEditor({ section }) {
  const { t } = useLang();
  const { data, setData, save, msg, busy } = useSection(section);
  if (!data) return <div className="loading">…</div>;
  const set = (k) => (e) => setData({ ...data, [k]: e.target.value });
  return (
    <div className="card">
      <div className="card-legend">{section === 'privacy' ? t('nav_privacy') : t('nav_terms')}</div>
      <div className="grid2">
        <div className="field"><label>{t('legal_title_en')}</label><input value={data.title_en || ''} onChange={set('title_en')} /></div>
        <div className="field"><label>{t('legal_title_fr')}</label><input value={data.title_fr || ''} onChange={set('title_fr')} /></div>
      </div>
      <div className="field"><label>{t('legal_updated')}</label><input value={data.updated || ''} onChange={set('updated')} placeholder="2026-01-01" style={{ maxWidth: 200 }} /></div>
      <div className="field"><label>{t('legal_body_en')}</label><textarea value={data.body_en || ''} onChange={set('body_en')} rows={12} /></div>
      <div className="field"><label>{t('legal_body_fr')}</label><textarea value={data.body_fr || ''} onChange={set('body_fr')} rows={12} /></div>
      <p className="muted" style={{ fontSize: 12.5 }}>{t('legal_edit_hint')}</p>
      <SaveBar msg={msg} busy={busy} onSave={() => save(data)} />
    </div>
  );
}
