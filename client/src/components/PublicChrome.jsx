import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBranches } from '../context/BranchesContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { LogoMark, Wordmark } from './Brand.jsx';

/**
 * The public site chrome (top nav + footer) shared by the landing, team and
 * careers pages. `onSection(id)` handles the About/Services/Contact links:
 * on the landing page it smooth-scrolls; on other pages it navigates home
 * with a hash so the landing page can scroll once mounted.
 */
export function PublicNav({ onSection }) {
  const nav = useNavigate();
  return (
    <div className="lp-nav"><div className="lp-nav-inner">
      <a onClick={() => nav('/')} style={{ cursor: 'pointer' }}><Wordmark size={40} /></a>
      <div className="lp-links">
        <a onClick={() => onSection('about')}>About</a>
        <a onClick={() => onSection('services')}>Services</a>
        <a onClick={() => nav('/team')}>Team</a>
        <a onClick={() => nav('/board')}>Board</a>
        <a onClick={() => nav('/partners')}>Partners</a>
        <a onClick={() => nav('/careers')}>Careers</a>
        <a onClick={() => onSection('contact')}>Contact</a>
      </div>
      <div className="lp-cta">
        <button className="btn btn-ghost" onClick={() => nav('/login')}>Member login</button>
        <button className="btn btn-green" onClick={() => nav('/register')}>Become a member</button>
      </div>
    </div></div>
  );
}

export function PublicFooter({ onSection }) {
  const nav = useNavigate();
  const { t } = useLang();
  const { details, headquarters } = useBranches();
  const [contact, setContact] = useState(null);
  useEffect(() => {
    let active = true;
    api('/content/contact').then((r) => { if (active) setContact(r.data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return (
    <footer className="footer"><div className="footer-inner">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}><LogoMark size={38} /><strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>SONEL Workers Credit Union</strong></div>
        <p className="desc">SOWOCCUL — Deductions at Source plus Express Savings. A licensed microfinance institution (COBAC · MINFI · CEMAC · NCC) serving cooperators since 1995. Open to the public. Save regularly, borrow wisely, repay promptly.</p>
      </div>
      <div><h5>Products &amp; services</h5><a onClick={() => onSection('services')}>Savings accounts</a><a onClick={() => onSection('services')}>Express Savings</a><a onClick={() => onSection('services')}>Loans</a><a onClick={() => onSection('services')}>Transfers</a></div>
      <div><h5>Our branches</h5>
        {(details && details.length ? details : []).map((b) => (
          <a
            key={b.id || b.name}
            href={`/branch/${b.id || encodeURIComponent(b.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ cursor: 'pointer' }}
          >
            {b.name}{b.name === headquarters ? ' (HQ)' : ''}
          </a>
        ))}
      </div>
      <div><h5>Contact</h5>
        <a>{contact?.address || 'Limbe, Cameroon'}</a>
        <a>{contact?.phone || '+237 600 000 000'}</a>
        <a>{contact?.email || 'members@sowoccul.cm'}</a>
        <a>{contact?.hours || 'Mon–Fri, 8am–5pm'}</a>
        <a style={{ opacity: 0.75 }}>{contact?.closed || 'Closed Saturdays, Sundays and public holidays'}</a>
      </div>
      <div><h5>Legal</h5>
        <a onClick={() => nav('/privacy')} style={{ cursor: 'pointer' }}>{t('nav_privacy')}</a>
        <a onClick={() => nav('/terms')} style={{ cursor: 'pointer' }}>{t('nav_terms')}</a>
        <a onClick={() => nav('/verify')} style={{ cursor: 'pointer' }}>{t('verify_title')}</a>
      </div>
    </div>
      <div className="footer-inner" style={{ paddingTop: 0 }}><div className="footer-bottom" style={{ gridColumn: '1/-1', width: '100%' }}>
        <span>© {new Date().getFullYear()} Sonel Workers Credit Union (SOWOCCUL). All rights reserved.</span>
      </div></div>
    </footer>
  );
}
