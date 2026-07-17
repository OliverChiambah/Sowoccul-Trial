import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';

// Generates initials from a name; falls back to a person glyph when empty.
function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Resolve a photo value: "/path.jpg" static file, or an uploaded image id. */
function photoSrc(photo) {
  const p = String(photo || '');
  return p.startsWith('/') ? p : `/api/content/images/${p}`;
}

function BoardMember({ name, role, photo, variant = 'director' }) {
  const { t } = useLang();
  const filled = Boolean(name && name.trim());
  const ring = variant === 'chair' ? 'var(--green-700)' : 'var(--navy)';
  const size = variant === 'chair' ? 96 : 72;
  return (
    <div className={`team-card ${variant === 'chair' ? 'gm' : 'manager'}${filled ? '' : ' empty'}`}>
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
      <div className="team-name">{filled ? name : t('board_tba')}</div>
      <div className="team-role">{role}</div>
    </div>
  );
}

export default function Board() {
  const nav = useNavigate();
  const { t } = useLang();
  const goSection = (id) => nav(`/#${id}`);
  const [board, setBoard] = useState(null);

  // Board members are managed by admins and served from the API.
  useEffect(() => {
    let active = true;
    api('/content/board').then((r) => { if (active) setBoard(r.data); }).catch(() => { if (active) setBoard({ chair: {}, directors: [] }); });
    return () => { active = false; };
  }, []);

  const chair = board?.chair || { role: 'Chairperson, Board of Directors' };
  const directors = board?.directors || [];

  return (
    <>
      <PublicNav onSection={goSection} />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div className="sec-eyebrow">{t('board_eyebrow')}</div>
          <h1>{t('board_title')}</h1>
          <p>{t('board_intro')}</p>
        </div>
      </section>

      <section className="team section" style={{ paddingTop: 10 }}>
        <div className="team-org">
          <div className="team-row team-center"><BoardMember name={chair.name} role={chair.role} photo={chair.photo} variant="chair" /></div>
          {directors.length > 0 && (
            <>
              <div className="team-connector" aria-hidden="true" />
              <div className="team-row team-managers">
                {directors.map((m, i) => <BoardMember key={m.role ? m.role + i : i} {...m} variant="director" />)}
              </div>
            </>
          )}
        </div>
      </section>

      <PublicFooter onSection={goSection} />
    </>
  );
}
