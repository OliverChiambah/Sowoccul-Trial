import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';
import { readPdfFile } from '../lib/pdfUpload.js';

export default function Careers() {
  const nav = useNavigate();
  const { t } = useLang();
  const goSection = (id) => nav(`/#${id}`);
  const [careers, setCareers] = useState(null);
  const [applyFor, setApplyFor] = useState(null); // the job being applied to, or { open: true } for a general application

  // Job postings are managed by admins and served from the API.
  useEffect(() => {
    let active = true;
    api('/content/careers').then((r) => { if (active) setCareers(r.data); }).catch(() => { if (active) setCareers({ email: 'careers@sowoccul.cm', openings: [] }); });
    return () => { active = false; };
  }, []);

  const email = careers?.email || 'careers@sowoccul.cm';
  const openings = careers?.openings || [];

  return (
    <>
      <PublicNav onSection={goSection} />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div className="sec-eyebrow">{t('careers_eyebrow')}</div>
          <h1>{t('careers_title')}</h1>
          <p>{t('careers_intro')}</p>
        </div>
      </section>

      <section className="careers section" style={{ paddingTop: 10 }}>
        {applyFor ? (
          <ApplicationForm
            job={applyFor.open ? null : applyFor}
            onCancel={() => setApplyFor(null)}
          />
        ) : openings.length === 0 ? (
          <div className="careers-closed">
            <div className="careers-closed-card">
              <div className="careers-closed-art" aria-hidden="true">
                <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
                  {/* Soft backdrop */}
                  <rect x="0" y="0" width="240" height="160" rx="16" fill="var(--green-50)" />
                  <circle cx="120" cy="66" r="48" fill="var(--green-100)" />
                  {/* Building / cooperative office */}
                  <rect x="86" y="52" width="68" height="58" rx="4" fill="#fff" stroke="var(--green-700)" strokeWidth="2.5" />
                  <rect x="96" y="62" width="14" height="14" rx="2" fill="var(--green-100)" stroke="var(--green-700)" strokeWidth="1.6" />
                  <rect x="130" y="62" width="14" height="14" rx="2" fill="var(--green-100)" stroke="var(--green-700)" strokeWidth="1.6" />
                  <rect x="96" y="84" width="14" height="14" rx="2" fill="var(--green-100)" stroke="var(--green-700)" strokeWidth="1.6" />
                  <rect x="116" y="92" width="18" height="18" rx="2" fill="var(--green-700)" />
                  {/* Roof + flag */}
                  <path d="M80 52 L120 34 L160 52 Z" fill="var(--green-700)" />
                  <line x1="120" y1="34" x2="120" y2="20" stroke="var(--navy)" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M120 21 L136 26 L120 31 Z" fill="var(--blue-600)" />
                  {/* Clock face — "check back later" */}
                  <circle cx="182" cy="104" r="20" fill="#fff" stroke="var(--blue-600)" strokeWidth="2.5" />
                  <line x1="182" y1="104" x2="182" y2="94" stroke="var(--blue-700)" strokeWidth="2.4" strokeLinecap="round" />
                  <line x1="182" y1="104" x2="190" y2="108" stroke="var(--blue-700)" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="careers-closed-title">{t('careers_closed_title')}</h2>
              <p className="careers-closed-text">{t('careers_closed_text')}</p>
              <div className="careers-closed-actions">
                <button className="btn btn-ghost" onClick={() => setApplyFor({ open: true })}>{t('careers_open_apply')}</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="careers-grid">
              {openings.map((job, i) => (
                <div className="career-card" key={i}>
                  <div className="career-head">
                    <span className={`career-tag ${job.type === 'Internship' ? 'intern' : ''}`}>{job.type}</span>
                    <span className="career-branch">{job.branch}</span>
                  </div>
                  <h3>{job.title}</h3>
                  <p>{job.body}</p>
                  <button className="career-apply" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit' }} onClick={() => setApplyFor(job)}>{t('careers_apply')} →</button>
                </div>
              ))}
            </div>
            <p className="careers-foot">{t('careers_open_prompt')} <button className="link-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'var(--blue-700)', textDecoration: 'underline' }} onClick={() => setApplyFor({ open: true })}>{t('careers_open_apply')}</button>.</p>
          </>
        )}
      </section>

      <PublicFooter onSection={goSection} />
    </>
  );
}

function ApplicationForm({ job, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({});
  const [cv, setCv] = useState(null);       // { dataUrl, filename }
  const [cover, setCover] = useState(null); // { dataUrl, filename }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function onCv(e) {
    setError('');
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try { setCv(await readPdfFile(file)); } catch (err) { setError(err.message); setCv(null); }
  }
  async function onCover(e) {
    setError('');
    const file = e.target.files && e.target.files[0];
    if (!file) { setCover(null); return; }
    try { setCover(await readPdfFile(file)); } catch (err) { setError(err.message); setCover(null); }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!(form.full_name || '').trim()) { setError(t('apply_err_name')); return; }
    if (!(form.email || '').trim()) { setError(t('apply_err_email')); return; }
    if (!cv) { setError(t('apply_err_cv')); return; }
    setBusy(true);
    try {
      await api('/content/careers/apply', {
        method: 'POST',
        body: {
          position: job ? `${job.title} (${job.branch})` : '',
          branch: job ? job.branch : '',
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          dob: form.dob,
          address: form.address,
          education: form.education,
          experience: form.experience,
          message: form.message,
          cv: cv.dataUrl,
          cv_filename: cv.filename,
          cover: cover ? cover.dataUrl : '',
          cover_filename: cover ? cover.filename : '',
        },
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%', background: 'var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green-700)', fontSize: 26 }}>✓</div>
        <h2 style={{ marginBottom: 8 }}>{t('apply_done_title')}</h2>
        <p className="muted">{t('apply_done_text')}</p>
        <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={onCancel}>{t('apply_back')}</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <button className="btn btn-ghost" onClick={onCancel} style={{ marginBottom: 16 }}>← {t('apply_back')}</button>
      <h2 className="page-title" style={{ fontSize: 24 }}>
        {job ? t('apply_for').replace('{role}', `${job.title} · ${job.branch}`) : t('apply_general')}
      </h2>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={submit}>
        <div className="card">
          <div className="card-legend">{t('apply_personal')}</div>
          <div className="grid2">
            <div className="field"><label>{t('apply_name')}<span className="req">*</span></label>
              <input value={form.full_name || ''} onChange={set('full_name')} /></div>
            <div className="field"><label>{t('apply_email')}<span className="req">*</span></label>
              <input type="email" value={form.email || ''} onChange={set('email')} /></div>
            <div className="field"><label>{t('apply_phone')}</label>
              <input type="tel" value={form.phone || ''} onChange={set('phone')} /></div>
            <div className="field"><label>{t('apply_dob')}</label>
              <input type="date" value={form.dob || ''} onChange={set('dob')} /></div>
            <div className="field full"><label>{t('apply_address')}</label>
              <input value={form.address || ''} onChange={set('address')} /></div>
          </div>
        </div>

        <div className="card">
          <div className="card-legend">{t('apply_education')}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{t('apply_education_hint')}</p>
          <textarea rows={4} value={form.education || ''} onChange={set('education')} placeholder={t('apply_education_ph')} />
        </div>

        <div className="card">
          <div className="card-legend">{t('apply_experience')}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{t('apply_experience_hint')}</p>
          <textarea rows={4} value={form.experience || ''} onChange={set('experience')} placeholder={t('apply_experience_ph')} />
        </div>

        <div className="card">
          <div className="card-legend">{t('apply_documents')}</div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>{t('apply_documents_hint')}</p>
          <div className="grid2">
            <div className="field">
              <label>{t('apply_cv')}<span className="req">*</span></label>
              <input type="file" accept="application/pdf" onChange={onCv} />
              {cv && <span className="hint">✓ {cv.filename}</span>}
            </div>
            <div className="field">
              <label>{t('apply_cover')}</label>
              <input type="file" accept="application/pdf" onChange={onCover} />
              {cover && <span className="hint">✓ {cover.filename}</span>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-legend">{t('apply_message')}</div>
          <textarea rows={3} value={form.message || ''} onChange={set('message')} placeholder={t('apply_message_ph')} />
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? t('apply_submitting') : t('apply_submit')}</button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancel')}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
