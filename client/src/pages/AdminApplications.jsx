import { useEffect, useState } from 'react';
import { api, apiBlob } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { formatDateTime } from '../lib/format.js';

/**
 * Job applications review (General Manager + IT administrator).
 * Lists applications from the public Careers page, shows each applicant's
 * details, and lets a reviewer open/download the CV and cover letter PDFs and
 * record a decision. The list never carries the PDF bytes; those are fetched on
 * demand via authenticated blob downloads.
 */
export default function AdminApplications() {
  const { t, lang } = useLang();
  const [apps, setApps] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      const r = await api(`/admin/applications${q}`);
      setApps(r.applications);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  if (selected) {
    return <ApplicationDetail id={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  const statuses = ['all', 'new', 'reviewed', 'shortlisted', 'rejected'];

  return (
    <>
      <div className="page-eyebrow">{t('nav_applications')}</div>
      <h1 className="page-title">{t('apps_title')}</h1>
      <p className="page-intro">{t('apps_intro')}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="step-chips" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {statuses.map((s) => (
          <button key={s} className={'step-chip' + (filter === s ? ' active' : '')} onClick={() => setFilter(s)}>
            {t('apps_status_' + s)}
          </button>
        ))}
      </div>

      {!apps ? (
        <div className="loading">…</div>
      ) : apps.length === 0 ? (
        <div className="card"><div className="empty">{t('apps_none')}</div></div>
      ) : (
        apps.map((a) => (
          <div className="card" key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 16 }}>
                {a.full_name}
                <span className={'pill-status ' + statusClass(a.status)} style={{ marginLeft: 8 }}>{t('apps_status_' + a.status)}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {a.position || t('apps_general')} {a.branch ? `· ${a.branch}` : ''}
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {a.email}{a.phone ? ` · ${a.phone}` : ''} · {formatDateTime(a.created_at, lang)}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setSelected(a.id)}>{t('apps_open')}</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}

function statusClass(s) {
  if (s === 'new') return 'status-pending';
  if (s === 'shortlisted') return 'status-approved';
  if (s === 'rejected') return 'status-rejected';
  return '';
}

function ApplicationDetail({ id, onBack }) {
  const { t, lang } = useLang();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState('');

  async function load() {
    setError('');
    try {
      const r = await api(`/admin/applications/${id}`);
      setA(r.application);
      setNote(r.application.review_note || '');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function openPdf(which) {
    setDownloading(which); setError('');
    try {
      const blob = await apiBlob(`/admin/applications/${id}/${which}`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // Give the new tab time to load before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setError(e.message); }
    finally { setDownloading(''); }
  }

  async function setStatus(status) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`/admin/applications/${id}/status`, { method: 'POST', body: { status, note: note.trim() || undefined } });
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!a) return <div className="loading">…</div>;

  const row = (label, value) => value ? (
    <div><dt>{label}</dt><dd>{value}</dd></div>
  ) : null;

  return (
    <>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>← {t('apps_back')}</button>
      <h1 className="page-title">{a.full_name}</h1>
      <p className="page-intro">{a.position || t('apps_general')} {a.branch ? `· ${a.branch}` : ''}</p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-legend">{t('apps_documents')}</div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={!a.has_cv || downloading === 'cv'} onClick={() => openPdf('cv')}>
            {downloading === 'cv' ? t('apps_opening') : t('apps_view_cv')}
          </button>
          <button className="btn btn-ghost" disabled={!a.has_cover || downloading === 'cover'} onClick={() => openPdf('cover')}>
            {a.has_cover ? (downloading === 'cover' ? t('apps_opening') : t('apps_view_cover')) : t('apps_no_cover')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-legend">{t('apps_details')}</div>
        <dl className="branch-dl">
          {row(t('apply_email'), <a href={`mailto:${a.email}`}>{a.email}</a>)}
          {row(t('apply_phone'), a.phone)}
          {row(t('apply_dob'), a.dob)}
          {row(t('apply_address'), a.address)}
          {row(t('apps_submitted'), formatDateTime(a.created_at, lang))}
        </dl>
      </div>

      {a.education && (
        <div className="card">
          <div className="card-legend">{t('apply_education')}</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.education}</p>
        </div>
      )}

      {a.experience && (
        <div className="card">
          <div className="card-legend">{t('apply_experience')}</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.experience}</p>
        </div>
      )}

      {a.message && (
        <div className="card">
          <div className="card-legend">{t('apply_message')}</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.message}</p>
        </div>
      )}

      <div className="card">
        <div className="card-legend">{t('apps_decision')}</div>
        <p className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>
          {t('apps_current')}: <strong>{t('apps_status_' + a.status)}</strong>
          {a.reviewed_by_name ? ` · ${t('apps_by')} ${a.reviewed_by_name}` : ''}
        </p>
        <div className="field">
          <label>{t('apps_note')}</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('apps_note_ph')} />
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('shortlisted')}>{t('apps_shortlist')}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus('reviewed')}>{t('apps_mark_reviewed')}</button>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} disabled={busy} onClick={() => setStatus('rejected')}>{t('apps_reject')}</button>
        </div>
      </div>
    </>
  );
}
