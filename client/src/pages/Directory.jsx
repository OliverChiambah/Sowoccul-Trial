import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';

/** Small round avatar; photo if present, else initials. */
function Avatar({ person }) {
  const initials = (person.full_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (person.staff_photo) return <img className="staff-avatar staff-avatar-lg" src={person.staff_photo} alt="" />;
  return <div className="staff-avatar staff-avatar-lg staff-avatar-fallback">{initials}</div>;
}

/**
 * Internal staff directory — visible to any signed-in staff, manager, or admin
 * (enforced on the server). Members never see this. Read-only; editing is the
 * admin's job in the Staff console.
 */
export default function Directory() {
  const { t } = useLang();
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/staff/directory')
      .then((r) => { if (active) setStaff(r.staff); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!staff) return <div className="loading">…</div>;

  // Group by branch for a tidy directory.
  const byBranch = {};
  staff.forEach((s) => { (byBranch[s.branch] = byBranch[s.branch] || []).push(s); });

  return (
    <>
      <div className="page-eyebrow">{t('directory_eyebrow')}</div>
      <h1 className="page-title">{t('directory_title')}</h1>
      <p className="page-intro">{t('directory_intro')}</p>

      {staff.length === 0 && <div className="empty">{t('directory_empty')}</div>}

      {Object.keys(byBranch).sort().map((branch) => (
        <div className="card" key={branch}>
          <div className="card-legend">{branch}</div>
          <div className="directory-grid">
            {byBranch[branch].map((s) => (
              <div className="directory-card" key={s.id}>
                <Avatar person={s} />
                <div style={{ fontWeight: 600, color: 'var(--navy)', marginTop: 8 }}>{s.full_name}</div>
                <div className="pill" style={{ margin: '4px 0' }}>{s.title_label}</div>
                {s.employee_id && <div className="muted" style={{ fontSize: 12 }}>{s.employee_id}</div>}
                {s.bio && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{s.bio}</p>}
                <div className="muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.7 }}>
                  {s.email && <div>✉ {s.email}</div>}
                  {s.phone && <div>☎ {s.phone}{s.work_extension ? ` · ${t('staff_work_ext')} ${s.work_extension}` : ''}</div>}
                  {s.languages && <div>🗣 {s.languages}</div>}
                  {s.start_date && <div>{t('staff_start_date')}: {s.start_date}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
