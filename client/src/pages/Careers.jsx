import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { PublicNav, PublicFooter } from '../components/PublicChrome.jsx';

export default function Careers() {
  const nav = useNavigate();
  const goSection = (id) => nav(`/#${id}`);
  const [careers, setCareers] = useState(null);

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
          <div className="sec-eyebrow">Careers</div>
          <h1>Grow your career with us</h1>
          <p>We announce new job openings and internships here. Join a cooperative that invests in its people and its members.</p>
        </div>
      </section>

      <section className="careers section" style={{ paddingTop: 10 }}>
        {openings.length === 0 ? (
          <div className="careers-empty">
            <p>There are no open positions right now. Please check back soon — new openings and internships are announced here.</p>
            <a className="btn btn-ghost" href={`mailto:${email}`}>Send us your CV</a>
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
                  <a className="career-apply" href={`mailto:${email}?subject=Application: ${encodeURIComponent(job.title)} (${encodeURIComponent(job.branch)})`}>Apply now →</a>
                </div>
              ))}
            </div>
            <p className="careers-foot">Don’t see a role that fits? Send an open application to <a href={`mailto:${email}`}>{email}</a>.</p>
          </>
        )}
      </section>

      <PublicFooter onSection={goSection} />
    </>
  );
}
