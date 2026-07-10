import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';
import { useLang } from '../lib/i18n.jsx';

/**
 * Renders an admin-editable legal page (Privacy Policy or Terms of Service).
 * The content is stored per section with `title_en/fr` and `body_en/fr`, so it
 * shows in the reader's language and can be edited without code.
 */
export default function LegalPage({ section }) {
  const nav = useNavigate();
  const { lang, t } = useLang();
  const goSection = (id) => nav(`/#${id}`);
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    api(`/content/${section}`).then((r) => { if (active) setData(r.data); }).catch(() => { if (active) setData({}); });
    return () => { active = false; };
  }, [section]);

  const title = (data && (lang === 'fr' ? data.title_fr : data.title_en)) || (section === 'privacy' ? t('nav_privacy') : t('nav_terms'));
  const body = (data && (lang === 'fr' ? data.body_fr : data.body_en)) || '';
  const updated = data && data.updated;

  return (
    <>
      <PublicNav onSection={goSection} />
      <section className="page-hero">
        <div className="page-hero-inner">
          <div className="sec-eyebrow">{t('legal_eyebrow')}</div>
          <h1>{title}</h1>
          {updated && <p>{t('legal_updated')}: {updated}</p>}
        </div>
      </section>
      <section className="section" style={{ paddingTop: 10, maxWidth: 820, margin: '0 auto' }}>
        {body
          ? body.split(/\n\n+/).map((para, i) => (
              <p key={i} style={{ marginBottom: 16, lineHeight: 1.7, color: 'var(--ink-700)' }}>{para}</p>
            ))
          : <p className="muted">…</p>}
      </section>
      <PublicFooter onSection={goSection} />
    </>
  );
}
