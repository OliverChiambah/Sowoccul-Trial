import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useLang } from '../lib/i18n.jsx';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';

/**
 * Partners, regulators and affiliations.
 * Content is admin-editable and served from the API; logos live under
 * /partners/ in the public folder. A group with no logo for an item simply
 * shows the name, so text-only partners still appear.
 */
export default function Partners() {
  const nav = useNavigate();
  const { t } = useLang();
  const goSection = (id) => nav(`/#${id}`);
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    api('/content/partners')
      .then((r) => { if (active) setData(r.data); })
      .catch(() => { if (active) setData({ groups: [] }); });
    return () => { active = false; };
  }, []);

  const groups = data?.groups || [];

  return (
    <>
      <PublicNav onSection={goSection} />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div className="sec-eyebrow">{t('partners_eyebrow')}</div>
          <h1>{t('partners_title')}</h1>
          <p>{data?.intro || t('partners_intro')}</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 10 }}>
        {groups.map((g, i) => (
          <div className="partner-group" key={i}>
            <h2 className="partner-group-title">{g.title}</h2>
            {g.note && <p className="partner-group-note">{g.note}</p>}
            <div className="partner-grid">
              {(g.items || []).map((it, j) => (
                <div className="partner-tile" key={j} title={it.name}>
                  {it.logo ? (
                    <img src={`/partners/${it.logo}`} alt={it.name} loading="lazy" />
                  ) : (
                    <span className="partner-textonly">{it.name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <PublicFooter onSection={goSection} />
    </>
  );
}
