import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function roleLabel(role, t) {
  if (role === 'admin') return t('branch_role_admin');
  if (role === 'staff') return t('branch_role_staff');
  return role;
}

function StaffCard({ person, t }) {
  return (
    <div className="team-card manager">
      <div className="team-avatar" style={{ width: 72, height: 72, borderColor: 'var(--navy)', color: 'var(--navy)' }}>
        <span className="team-initials">{initials(person.full_name)}</span>
      </div>
      <div className="team-name">{person.full_name}</div>
      <div className="team-role">{roleLabel(person.role, t)}</div>
      {person.phone && <div className="team-branch">{person.phone}</div>}
      {person.email && <a className="team-branch" href={`mailto:${person.email}`} style={{ color: 'var(--blue-700)' }}>{person.email}</a>}
    </div>
  );
}

export default function BranchPage() {
  const { idOrName } = useParams();
  const nav = useNavigate();
  const { t } = useLang();
  const goSection = (id) => nav(`/#${id}`);
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: null });
    api(`/content/branch/${encodeURIComponent(idOrName)}`)
      .then((r) => { if (active) setState({ loading: false, data: r, error: null }); })
      .catch((e) => { if (active) setState({ loading: false, data: null, error: e.message }); });
    return () => { active = false; };
  }, [idOrName]);

  const { loading, data, error } = state;
  const branch = data?.branch;
  const staff = data?.staff || [];

  return (
    <>
      <PublicNav onSection={goSection} />

      {loading && <section className="page-hero"><div className="page-hero-inner"><p>{t('branch_loading')}</p></div></section>}

      {!loading && error && (
        <section className="page-hero"><div className="page-hero-inner">
          <div className="sec-eyebrow">{t('branch_eyebrow')}</div>
          <h1>{t('branch_not_found')}</h1>
          <p>{t('branch_not_found_text')}</p>
          <button className="btn btn-green" onClick={() => nav('/')} style={{ marginTop: 12 }}>{t('branch_back_home')}</button>
        </div></section>
      )}

      {!loading && branch && (
        <>
          <section className="page-hero"><div className="page-hero-inner">
            <div className="sec-eyebrow">{t('branch_eyebrow')}</div>
            <h1>{branch.name}{branch.is_hq ? ` · ${t('headquarters')}` : ''}</h1>
            {branch.description && <p>{branch.description}</p>}
          </div></section>

          <section className="section branch-detail" style={{ paddingTop: 4 }}>
            <div className="branch-grid">
              <div className="branch-photo-wrap">
                {branch.office_photo
                  ? <img className="branch-photo" src={`/api/content/images/${branch.office_photo}`} alt={branch.name} />
                  : <div className="branch-photo placeholder"><svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="var(--ink-400)" strokeWidth="1.4"><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-6h6v6" /></svg></div>}
              </div>
              <div className="branch-info card">
                <div className="card-legend">{t('branch_details')}</div>
                <dl className="branch-dl">
                  <div><dt>{t('content_address')}</dt><dd>{branch.address || '—'}</dd></div>
                  <div><dt>{t('content_phone')}</dt><dd>{branch.phone ? <a href={`tel:${branch.phone}`}>{branch.phone}</a> : '—'}</dd></div>
                  <div><dt>{t('content_email')}</dt><dd>{branch.email ? <a href={`mailto:${branch.email}`}>{branch.email}</a> : '—'}</dd></div>
                  {branch.manager_name && <div><dt>{t('content_branch_manager')}</dt><dd>{branch.manager_name}</dd></div>}
                </dl>
              </div>
            </div>

            <div className="branch-staff">
              <div className="sec-eyebrow" style={{ marginTop: 8 }}>{t('branch_staff')}</div>
              <h2 className="sec-title" style={{ fontSize: 24 }}>{t('branch_staff_title')}</h2>
              {staff.length === 0
                ? <div className="empty" style={{ marginTop: 12 }}>{t('branch_no_staff')}</div>
                : <div className="team-row team-managers" style={{ marginTop: 16 }}>{staff.map((p, i) => <StaffCard key={i} person={p} t={t} />)}</div>}
            </div>
          </section>
        </>
      )}

      <PublicFooter onSection={goSection} />
    </>
  );
}
