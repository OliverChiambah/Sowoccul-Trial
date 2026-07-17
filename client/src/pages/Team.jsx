import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';

// Generates initials from a name; falls back to a person glyph when empty.
function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * Resolve a photo value to a URL. Supports two forms so photos can be either
 * shipped with the site or uploaded by an admin:
 *   • a path like "/team/name.jpg" (static file in public/) — used as-is
 *   • an id like "abc123" — an admin-uploaded image, served from the API
 */
function photoSrc(photo) {
  const p = String(photo || '');
  return p.startsWith('/') ? p : `/api/content/images/${p}`;
}

function TeamMember({ name, role, branch, phone, email, photo, variant = 'manager' }) {
  const filled = Boolean(name && name.trim());
  const ring = variant === 'president' ? 'var(--green-700)' : variant === 'gm' ? 'var(--blue-700)' : 'var(--navy)';
  const size = variant === 'president' ? 88 : variant === 'gm' ? 96 : 72;
  return (
    <div className={`team-card ${variant}${filled ? '' : ' empty'}`}>
      <div className="team-avatar" style={{ width: size, height: size, borderColor: filled ? ring : 'var(--paper-200)', color: ring, overflow: 'hidden' }}>
        {photo ? (
          <img src={photoSrc(photo)} alt={name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : filled ? (
          <span className="team-initials">{initials(name)}</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width={size * 0.5} height={size * 0.5}>
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        )}
      </div>
      <div className="team-name">{filled ? name : 'To be announced'}</div>
      <div className="team-role">{role}</div>
      {branch && <div className="team-branch">{branch}</div>}
      {filled && phone && <div className="team-branch">{phone}</div>}
      {filled && email && <a className="team-branch" href={`mailto:${email}`} style={{ color: 'var(--blue-700)' }}>{email}</a>}
    </div>
  );
}

export default function Team() {
  const nav = useNavigate();
  const goSection = (id) => nav(`/#${id}`);
  const [team, setTeam] = useState(null);

  // Team names are managed by admins and served from the API.
  useEffect(() => {
    let active = true;
    api('/content/team').then((r) => { if (active) setTeam(r.data); }).catch(() => { if (active) setTeam({ president: {}, gm: {}, managers: [] }); });
    return () => { active = false; };
  }, []);

  const president = team?.president || { role: 'President, Board of Directors' };
  const gm = team?.gm || { role: 'General Manager' };
  const agm = team?.agm || null;
  const leadership = team?.leadership || [];
  const branchManagers = team?.managers || [];

  return (
    <>
      <PublicNav onSection={goSection} />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div className="sec-eyebrow">Our team</div>
          <h1>The people behind SOWOCCUL</h1>
          <p>Led by our Board President and General Manager, supported by our Assistant General Manager, and served across the country from our Head Office and six branches.</p>
        </div>
      </section>

      <section className="team section" style={{ paddingTop: 10 }}>
        <div className="team-org">
          <div className="team-row team-top"><TeamMember name={president.name} role={president.role} photo={president.photo} variant="president" /></div>
          <div className="team-connector" aria-hidden="true" />
          <div className="team-row team-center"><TeamMember name={gm.name} role={gm.role} phone={gm.phone} email={gm.email} photo={gm.photo} variant="gm" /></div>
          {agm && agm.name && (
            <>
              <div className="team-connector" aria-hidden="true" />
              <div className="team-row team-center">
                <TeamMember name={agm.name} role={agm.role} branch={agm.branch} phone={agm.phone} email={agm.email} photo={agm.photo} variant="gm" />
              </div>
            </>
          )}
          {leadership.length > 0 && (
            <>
              <div className="team-connector" aria-hidden="true" />
              <div className="team-row team-managers">
                {leadership.map((m, i) => <TeamMember key={m.role || i} {...m} variant="manager" />)}
              </div>
            </>
          )}
          <div className="team-connector" aria-hidden="true" />
          <div className="team-row team-managers">
            {branchManagers.map((m, i) => <TeamMember key={m.branch || i} {...m} variant="manager" />)}
          </div>
        </div>
      </section>

      <PublicFooter onSection={goSection} />
    </>
  );
}
