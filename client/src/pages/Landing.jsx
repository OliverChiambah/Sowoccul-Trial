import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { LogoMark, Wordmark } from '../components/Brand.jsx';

/* ---- Hero illustrations: on-brand, dependency-free SVG scenes ---- */

// Scene 1 — the app dashboard mockup (savings balance + loan progress).
function SceneDashboard() {
  return (
    <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Member dashboard with savings balance and loan progress">
      <defs>
        <linearGradient id="hg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#178A50" /><stop offset="1" stopColor="#0F5132" /></linearGradient>
        <linearGradient id="hg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2B6CB0" /><stop offset="1" stopColor="#123C7A" /></linearGradient>
        <linearGradient id="hg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#EEF4FB" /></linearGradient>
      </defs>
      <rect x="30" y="40" width="460" height="360" rx="24" fill="url(#hg3)" stroke="#E6ECE9" />
      <rect x="60" y="70" width="220" height="300" rx="20" fill="#fff" stroke="#E6ECE9" strokeWidth="1.5" />
      <rect x="60" y="70" width="220" height="86" rx="20" fill="url(#hg1)" />
      <rect x="60" y="136" width="220" height="20" fill="url(#hg1)" />
      <text x="80" y="104" fill="#fff" fontFamily="IBM Plex Sans" fontSize="13" fontWeight="600">Savings balance</text>
      <text x="80" y="134" fill="#fff" fontFamily="Fraunces" fontSize="24" fontWeight="600">1 090 000 FCFA</text>
      <g fontFamily="IBM Plex Sans">
        <rect x="80" y="176" width="180" height="40" rx="10" fill="#F1F5F3" />
        <text x="120" y="192" fill="#16211C" fontSize="11.5" fontWeight="600">Salary deposit</text>
        <text x="120" y="207" fill="#8A968F" fontSize="10">28 Mar</text>
        <text x="250" y="200" fill="#127A45" fontSize="11.5" fontWeight="700" textAnchor="end">+250k</text>
        <rect x="80" y="224" width="180" height="40" rx="10" fill="#F1F5F3" />
        <text x="120" y="240" fill="#16211C" fontSize="11.5" fontWeight="600">School fees</text>
        <text x="120" y="255" fill="#8A968F" fontSize="10">05 Mar</text>
        <text x="250" y="248" fill="#B23A2E" fontSize="11.5" fontWeight="700" textAnchor="end">−120k</text>
      </g>
      <rect x="80" y="330" width="180" height="26" rx="8" fill="#127A45" />
      <text x="170" y="347" fill="#fff" fontFamily="IBM Plex Sans" fontSize="12" fontWeight="600" textAnchor="middle">Apply for a loan</text>
      <rect x="300" y="110" width="160" height="150" rx="18" fill="url(#hg2)" />
      <text x="320" y="140" fill="#fff" fontFamily="IBM Plex Sans" fontSize="12" fontWeight="600" opacity="0.85">Loan balance</text>
      <circle cx="380" cy="192" r="42" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
      <circle cx="380" cy="192" r="42" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset="92" transform="rotate(-90 380 192)" />
      <text x="380" y="188" fill="#fff" fontFamily="Fraunces" fontSize="18" fontWeight="600" textAnchor="middle">65%</text>
      <text x="380" y="205" fill="rgba(255,255,255,0.8)" fontFamily="IBM Plex Sans" fontSize="10" textAnchor="middle">repaid</text>
      <rect x="300" y="278" width="160" height="92" rx="18" fill="#fff" stroke="#E6ECE9" />
      <text x="320" y="304" fill="#5A6862" fontFamily="IBM Plex Sans" fontSize="11" fontWeight="600">Members growth</text>
      <polyline points="320,352 340,344 360,348 380,330 400,334 420,318 440,322" fill="none" stroke="#178A50" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="440" cy="322" r="4" fill="#178A50" />
    </svg>
  );
}

// Scene 2 — savings growth: coins stacking into a jar with a rising trend.
function SceneSavings() {
  return (
    <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Savings growing over time">
      <defs>
        <linearGradient id="sg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#EFF8F2" /></linearGradient>
        <linearGradient id="sgCoin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1FA35C" /><stop offset="1" stopColor="#0F5132" /></linearGradient>
      </defs>
      <rect x="30" y="40" width="460" height="360" rx="24" fill="url(#sg1)" stroke="#E6ECE9" />
      {/* rising bars */}
      <g>
        <rect x="70" y="250" width="46" height="100" rx="8" fill="#DCF0E4" />
        <rect x="128" y="210" width="46" height="140" rx="8" fill="#BFE3CD" />
        <rect x="186" y="160" width="46" height="190" rx="8" fill="#7FC79F" />
        <rect x="244" y="110" width="46" height="240" rx="8" fill="url(#sgCoin)" />
      </g>
      <polyline points="93,250 151,210 209,160 267,110" fill="none" stroke="#127A45" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="267" cy="110" r="6" fill="#127A45" />
      {/* savings jar with coins */}
      <g transform="translate(330,150)">
        <rect x="0" y="40" width="130" height="150" rx="20" fill="#EEF4FB" stroke="#C9D8EC" strokeWidth="2" />
        <rect x="-6" y="26" width="142" height="26" rx="12" fill="#2B6CB0" />
        <rect x="52" y="10" width="26" height="24" rx="6" fill="#2B6CB0" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <ellipse cx="65" cy={165 - i * 26} rx="46" ry="14" fill="url(#sgCoin)" />
            <text x="65" y={169 - i * 26} fill="#fff" fontFamily="Fraunces" fontSize="13" fontWeight="600" textAnchor="middle">₣</text>
          </g>
        ))}
        {/* a coin dropping in */}
        <circle cx="65" cy="6" r="16" fill="url(#sgCoin)" />
        <text x="65" y="11" fill="#fff" fontFamily="Fraunces" fontSize="14" fontWeight="600" textAnchor="middle">₣</text>
      </g>
      <text x="260" y="386" fill="#5A6862" fontFamily="IBM Plex Sans" fontSize="14" fontWeight="600" textAnchor="middle">Save regularly, watch it grow</text>
    </svg>
  );
}

// Scene 3 — a debit/member card, clean and modern.
function SceneCard() {
  return (
    <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }} role="img" aria-label="SOWOCCUL member card">
      <defs>
        <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F8FAF9" /><stop offset="1" stopColor="#EFF8F2" /></linearGradient>
        <linearGradient id="cardFace" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#178A50" /><stop offset="0.6" stopColor="#127A45" /><stop offset="1" stopColor="#1E56A0" /></linearGradient>
        <linearGradient id="chip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F4D48A" /><stop offset="1" stopColor="#C9A24B" /></linearGradient>
      </defs>
      <rect x="30" y="40" width="460" height="360" rx="24" fill="url(#cardBg)" stroke="#E6ECE9" />
      {/* back card */}
      <rect x="120" y="120" width="300" height="185" rx="20" fill="#0F5132" opacity="0.18" transform="rotate(-8 270 212)" />
      {/* front card */}
      <g transform="rotate(-8 260 220)">
        <rect x="100" y="130" width="320" height="200" rx="22" fill="url(#cardFace)" />
        <circle cx="360" cy="300" r="80" fill="#fff" opacity="0.08" />
        <circle cx="410" cy="150" r="46" fill="#fff" opacity="0.08" />
        <rect x="128" y="176" width="46" height="34" rx="7" fill="url(#chip)" />
        <path d="M128 193h46 M151 176v34" stroke="#9c7c34" strokeWidth="1.2" opacity="0.6" />
        <text x="128" y="250" fill="#fff" fontFamily="IBM Plex Mono" fontSize="18" letterSpacing="2">5027  8841  3390  0142</text>
        <text x="128" y="286" fill="rgba(255,255,255,0.85)" fontFamily="IBM Plex Sans" fontSize="12" fontWeight="600">A. COOPERATOR</text>
        <text x="360" y="286" fill="rgba(255,255,255,0.85)" fontFamily="IBM Plex Sans" fontSize="11">SOWOCCUL</text>
        <text x="128" y="164" fill="#fff" fontFamily="Fraunces" fontSize="15" fontWeight="600">SONEL Workers Credit Union</text>
      </g>
      <text x="260" y="386" fill="#5A6862" fontFamily="IBM Plex Sans" fontSize="14" fontWeight="600" textAnchor="middle">Your money, always within reach</text>
    </svg>
  );
}

// Scene 4 — security & trust: a vault/shield with a checkmark.
function SceneSecure() {
  return (
    <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Your savings are safe and regulated">
      <defs>
        <linearGradient id="secBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F8FAF9" /><stop offset="1" stopColor="#EEF4FB" /></linearGradient>
        <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2B6CB0" /><stop offset="1" stopColor="#123C7A" /></linearGradient>
      </defs>
      <rect x="30" y="40" width="460" height="360" rx="24" fill="url(#secBg)" stroke="#E6ECE9" />
      {/* shield */}
      <path d="M260 100 L340 128 V214 C340 268 304 300 260 318 C216 300 180 268 180 214 V128 Z" fill="url(#shield)" />
      <path d="M260 100 L340 128 V214 C340 268 304 300 260 318 C216 300 180 268 180 214 V128 Z" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M228 210 l22 22 l40 -46" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {/* regulator chips */}
      <g fontFamily="IBM Plex Sans" fontSize="11" fontWeight="600" textAnchor="middle">
        <rect x="120" y="342" width="66" height="30" rx="15" fill="#fff" stroke="#DCE4E0" /><text x="153" y="361" fill="#127A45">COBAC</text>
        <rect x="192" y="342" width="66" height="30" rx="15" fill="#fff" stroke="#DCE4E0" /><text x="225" y="361" fill="#1E56A0">MINFI</text>
        <rect x="264" y="342" width="72" height="30" rx="15" fill="#fff" stroke="#DCE4E0" /><text x="300" y="361" fill="#127A45">CEMAC</text>
        <rect x="342" y="342" width="58" height="30" rx="15" fill="#fff" stroke="#DCE4E0" /><text x="371" y="361" fill="#1E56A0">NCC</text>
      </g>
      <text x="260" y="86" fill="#122A54" fontFamily="Fraunces" fontSize="17" fontWeight="600" textAnchor="middle">Safe, secure & regulated</text>
    </svg>
  );
}

/**
 * Mobile-money deposit partner scenes. These are original graphics built in the
 * partners' brand colours to communicate the deposit partnership — they are not
 * reproductions of MTN's or Orange's trademarked logos. The USSD code and the
 * head-office MoMo number reflect how a member actually tops up their account.
 */
function SceneMomo() {
  return (
    <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Deposit to SOWOCCUL with MTN Mobile Money">
      <defs>
        <linearGradient id="momoBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF3" /><stop offset="1" stopColor="#FFF7DA" /></linearGradient>
      </defs>
      <rect x="30" y="40" width="460" height="360" rx="24" fill="url(#momoBg)" stroke="#F1E3A8" />
      {/* Brand disc in MTN yellow with a phone glyph */}
      <circle cx="260" cy="150" r="66" fill="#FFCB05" />
      <circle cx="260" cy="150" r="66" fill="none" stroke="#122A54" strokeOpacity="0.08" strokeWidth="2" />
      <rect x="238" y="116" width="44" height="68" rx="8" fill="#12233A" />
      <rect x="244" y="124" width="32" height="44" rx="3" fill="#FFCB05" />
      <circle cx="260" cy="176" r="4" fill="#FFCB05" />
      <path d="M252 146 l6 6 l12 -14" fill="none" stroke="#12233A" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Partner lockup */}
      <text x="260" y="252" fill="#122A54" fontFamily="Fraunces" fontSize="24" fontWeight="700" textAnchor="middle">MTN MoMo</text>
      <text x="260" y="278" fill="#5A6862" fontFamily="IBM Plex Sans" fontSize="13.5" fontWeight="600" textAnchor="middle">Mobile Money deposits to SOWOCCUL</text>
      {/* USSD + number pills */}
      <g fontFamily="IBM Plex Sans" textAnchor="middle">
        <rect x="150" y="300" width="100" height="46" rx="12" fill="#122A54" />
        <text x="200" y="322" fill="#FFCB05" fontSize="12" fontWeight="600">Dial</text>
        <text x="200" y="338" fill="#fff" fontSize="17" fontWeight="700" fontFamily="IBM Plex Mono">*126#</text>
        <rect x="262" y="300" width="150" height="46" rx="12" fill="#fff" stroke="#E6ECE9" />
        <text x="337" y="320" fill="#5A6862" fontSize="10.5" fontWeight="600">Head office MoMo</text>
        <text x="337" y="338" fill="#122A54" fontSize="16" fontWeight="700" fontFamily="IBM Plex Mono">681 629 380</text>
      </g>
      <text x="260" y="384" fill="#8A968F" fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">Official deposit partner</text>
    </svg>
  );
}

function SceneOrange() {
  return (
    <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Deposit to SOWOCCUL with Orange Money">
      <defs>
        <linearGradient id="omBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFBF7" /><stop offset="1" stopColor="#FFEEDD" /></linearGradient>
      </defs>
      <rect x="30" y="40" width="460" height="360" rx="24" fill="url(#omBg)" stroke="#FAD8B8" />
      {/* Brand disc in Orange orange with a phone glyph */}
      <circle cx="260" cy="150" r="66" fill="#FF7900" />
      <circle cx="260" cy="150" r="66" fill="none" stroke="#122A54" strokeOpacity="0.08" strokeWidth="2" />
      <rect x="238" y="116" width="44" height="68" rx="8" fill="#12233A" />
      <rect x="244" y="124" width="32" height="44" rx="3" fill="#FF7900" />
      <circle cx="260" cy="176" r="4" fill="#FF7900" />
      <path d="M252 146 l6 6 l12 -14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Partner lockup */}
      <text x="260" y="252" fill="#122A54" fontFamily="Fraunces" fontSize="24" fontWeight="700" textAnchor="middle">Orange Money</text>
      <text x="260" y="278" fill="#5A6862" fontFamily="IBM Plex Sans" fontSize="13.5" fontWeight="600" textAnchor="middle">Mobile Money deposits to SOWOCCUL</text>
      {/* USSD pill */}
      <g fontFamily="IBM Plex Sans" textAnchor="middle">
        <rect x="185" y="300" width="150" height="46" rx="12" fill="#122A54" />
        <text x="260" y="322" fill="#FF7900" fontSize="12" fontWeight="600">Dial</text>
        <text x="260" y="338" fill="#fff" fontSize="17" fontWeight="700" fontFamily="IBM Plex Mono">#150#</text>
      </g>
      <text x="260" y="384" fill="#8A968F" fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">Official deposit partner</text>
    </svg>
  );
}

const HERO_SCENES = [SceneDashboard, SceneSavings, SceneCard, SceneSecure, SceneMomo, SceneOrange];

/**
 * Rotating hero: fades between several banking/savings scenes on a timer.
 * Pauses on hover; dots let the visitor jump to a scene. All scenes are
 * stacked and cross-faded via opacity so there's no layout shift.
 */
function HeroCarousel({ images }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // If the admin uploaded hero images, rotate those; otherwise the built-in scenes.
  const useImages = Array.isArray(images) && images.length > 0;
  const count = useImages ? images.length : HERO_SCENES.length;

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    const id = setInterval(() => setActive((i) => (i + 1) % count), 4200);
    return () => clearInterval(id);
  }, [paused, count]);

  useEffect(() => { setActive(0); }, [useImages, count]);

  return (
    <div className="hero-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      style={{ filter: 'drop-shadow(0 20px 40px rgba(16,40,30,0.12))' }}>
      <div className="hero-carousel-stage">
        {useImages
          ? images.map((id, i) => (
            <div key={id} className={`hero-slide${i === active ? ' active' : ''}`} aria-hidden={i !== active}>
              <img src={`/api/content/images/${id}`} alt="" className="hero-photo" />
            </div>
          ))
          : HERO_SCENES.map((Scene, i) => (
            <div key={i} className={`hero-slide${i === active ? ' active' : ''}`} aria-hidden={i !== active}>
              <Scene />
            </div>
          ))}
      </div>
      {count > 1 && (
        <div className="hero-dots">
          {Array.from({ length: count }).map((_, i) => (
            <button key={i} className={`hero-dot${i === active ? ' active' : ''}`} onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_HERO_TRUST = [
  { num: '30 yrs', lbl: 'Serving cooperators since 1995' },
  { num: 'Licensed MFI', lbl: 'COBAC · MINFI · CEMAC · NCC' },
  { num: '6', lbl: 'Branches · HQ in Limbe' },
];
const DEFAULT_SERVICES = [
  { title: 'Savings accounts', body: 'Grow your money safely with regular savings and share capital. Deductions at source make saving effortless, month after month.' },
  { title: 'Express Savings', body: 'Save and access your money faster with Express Savings — flexible deposits and quick availability when you need them.' },
  { title: 'Affordable loans', body: 'Borrow for education, housing, business, health and more — with clear terms, fair rates and a repayment plan that fits your income.' },
  { title: 'Instant transfers', body: 'Move money between your savings and share accounts in seconds, any time, from any device.' },
  { title: 'Loan balance tracking', body: 'See exactly what you owe, how much you’ve repaid and what’s left — updated the moment a repayment is posted.' },
  { title: 'Digital applications', body: 'Apply for a loan online in six simple steps, in English or French, and track your application from submission to decision.' },
];
const DEFAULT_WHY = [
  { title: 'Safe & regulated', body: 'A licensed MFI under COBAC, MINFI, CEMAC and NCC, with your savings handled under sound cooperative governance.' },
  { title: 'Open to all', body: 'No longer limited to SONEL staff — investors and cooperators from the public are welcome to join.' },
  { title: 'Fair credit', body: 'Loans priced fairly, assessed on your real capacity, with terms you can actually repay.' },
  { title: 'Effortless saving', body: 'Deductions at source plus Express Savings mean you save and repay automatically.' },
];
const DEFAULT_STATS = [
  { n: '1995', l: 'Serving cooperators since' },
  { n: '6', l: 'Branches · HQ in Limbe' },
  { n: 'MFI', l: 'COBAC · MINFI · CEMAC · NCC' },
  { n: 'EN / FR', l: 'Bilingual service' },
];

const Svc = ({ color, bg, title, body }) => (
  <div className="svc-card">
    <div className="svc-ico" style={{ background: bg, color }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="26" height="26"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h3" /></svg>
    </div>
    <h3>{title}</h3><p>{body}</p>
  </div>
);

export default function Landing() {
  const { t } = useLang();
  const nav = useNavigate();
  const login = () => nav('/login');
  const join = () => nav('/register');
  const scroll = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  // Landing text and hero images are admin-editable, served from the API.
  const [c, setC] = useState(null);
  useEffect(() => {
    let active = true;
    api('/content/landing').then((r) => { if (active) setC(r.data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Partner logos for the strip. We show only the main partners here (the full
  // list, including regulators and affiliations, lives on /partners).
  const [partnerLogos, setPartnerLogos] = useState([]);
  useEffect(() => {
    let active = true;
    api('/content/partners').then((r) => {
      if (!active) return;
      const groups = r.data?.groups || [];
      const main = groups[0]?.items || [];
      setPartnerLogos(main.filter((p) => p.logo));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // When arriving from /team or /careers via a link like /#about, scroll there.
  useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (id) {
      // Wait a tick so the target section is in the DOM.
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, []);

  return (
    <>
      <div className="lp-nav"><div className="lp-nav-inner">
        <Wordmark size={40} />
        <div className="lp-links">
          <a onClick={() => scroll('about')}>About</a>
          <a onClick={() => scroll('services')}>Services</a>
          <a onClick={() => nav('/team')}>Team</a>
          <a onClick={() => nav('/board')}>Board</a>
          <a onClick={() => nav('/partners')}>Partners</a>
          <a onClick={() => nav('/careers')}>Careers</a>
          <a onClick={() => scroll('contact')}>Contact</a>
        </div>
        <div className="lp-cta">
          <button className="btn btn-ghost" onClick={login}>Member login</button>
          <button className="btn btn-green" onClick={join}>Become a member</button>
        </div>
      </div></div>

      <section className="hero"><div className="hero-inner">
        <div>
          <span className="hero-eyebrow"><LogoMark size={16} /> {c?.hero_eyebrow || 'Serving our cooperators since 1995'}</span>
          <h1>{c?.hero_title_1 || 'Save regularly.'}<br />{c?.hero_title_2 || 'Borrow wisely.'}<br /><span className="accent">{c?.hero_title_3 || 'Repay promptly.'}</span></h1>
          <p className="lede">{c?.hero_lede || 'Sonel Workers Credit Union (SOWOCCUL) is a member-owned microfinance cooperative — now open to investors and cooperators from the public, not just SONEL staff. We help you save with confidence and access fair, affordable credit through Deductions at Source plus Express Savings.'}</p>
          <div className="hero-actions">
            <button className="btn btn-green btn-lg" onClick={join}>{c?.hero_cta_primary || 'Open an account'}</button>
            <button className="btn btn-ghost btn-lg" onClick={login}>{c?.hero_cta_secondary || 'Member login'}</button>
          </div>
          <div className="hero-trust">
            {(c?.hero_trust && c.hero_trust.length ? c.hero_trust : DEFAULT_HERO_TRUST).map((it, i) => (
              <div className="item" key={i}><div className="num">{it.num}</div><div className="lbl">{it.lbl}</div></div>
            ))}
          </div>
        </div>
        <div className="hero-art"><HeroCarousel images={c?.hero_images} /></div>
      </div></section>

      <section className="section" id="services"><div className="sec-head">
        <div className="sec-eyebrow">{c?.services_eyebrow || 'What we offer'}</div>
        <h2 className="sec-title">{c?.services_title || 'Products and services for every cooperator'}</h2>
        <p className="sec-sub">{c?.services_sub || 'From everyday savings to loans that move your life forward — plus Express Savings and deductions at source — all in one cooperative you own together.'}</p>
      </div>
        <div className="svc-grid">
          {(c?.services && c.services.length ? c.services : DEFAULT_SERVICES).map((s, i) => (
            <Svc key={i} color={i % 2 === 0 ? '#127A45' : '#1E56A0'} bg={i % 2 === 0 ? 'var(--green-50)' : 'var(--blue-50)'} title={s.title} body={s.body} />
          ))}
        </div>
      </section>

      {/* Mission — from the cooperative's own advert */}
      <section className="mission-band" id="mission"><div className="mission-inner">
        <div className="sec-eyebrow" style={{ color: 'var(--green-200)' }}>{c?.mission_eyebrow || 'Our mission'}</div>
        <h2 className="mission-title">{c?.mission_title || 'Improving our members’ lives, together'}</h2>
        <p className="mission-body">{c?.mission_body}</p>
        <p className="mission-agm">{c?.mission_agm}</p>
        <div className="mission-tag">{c?.mission_tagline}</div>
      </div></section>

      {/* Full products & services catalogue */}
      <section className="section" id="catalogue"><div className="sec-head">
        <div className="sec-eyebrow">{c?.catalogue_eyebrow || 'Products and services'}</div>
        <h2 className="sec-title">{c?.catalogue_title || 'Everything we offer our members'}</h2>
        <p className="sec-sub">{c?.catalogue_sub}</p>
      </div>
        <div className="catalogue-grid">
          <ul className="catalogue-list">
            {(c?.catalogue_left || []).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          <ul className="catalogue-list">
            {(c?.catalogue_right || []).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      </section>

      {/* Upfront dividend payment package */}
      {(c?.dividend_rates || []).length > 0 && (
        <section className="section dividend-sec" id="dividend">
          <div className="dividend-inner">
            <div className="dividend-copy">
              <div className="sec-eyebrow">{c?.dividend_eyebrow || 'Upfront dividend payment package'}</div>
              <h2 className="sec-title" style={{ textAlign: 'left' }}>{c?.dividend_title || 'Take a long-term loan'}</h2>
              <p className="dividend-pitch">{c?.dividend_pitch}</p>
              <div className="dividend-motto">
                <span>{c?.hero_title_1 || 'Save regularly.'}</span>
                <span>{c?.hero_title_2 || 'Borrow wisely.'}</span>
                <span>{c?.hero_title_3 || 'Repay promptly.'}</span>
              </div>
              <p className="dividend-note">{c?.dividend_note}</p>
            </div>
            <div className="dividend-table-wrap">
              <table className="dividend-table">
                <thead>
                  <tr><th>{t('dividend_amount')}</th><th>{t('dividend_rate')}</th></tr>
                </thead>
                <tbody>
                  {(c?.dividend_rates || []).map((r, i) => (
                    <tr key={i}><td>{r.range}</td><td className="dividend-pct">{r.rate}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="about" id="about"><div className="about-inner">
        <div>
          <svg viewBox="0 0 440 300" style={{ width: '100%', height: 'auto' }} role="img" aria-label="Members supported by the cooperative">
            <rect x="10" y="10" width="420" height="280" rx="20" fill="#EFF8F2" />
            <g transform="translate(220,150)"><g transform="translate(-55,-55)"><LogoMark size={110} /></g></g>
          </svg>
        </div>
        <div>
          <div className="sec-eyebrow">{c?.about_eyebrow || 'About SOWOCCUL'}</div>
          <h2>{c?.about_title || 'A cooperative owned by the cooperators it serves'}</h2>
          <p>{c?.about_p1 || 'Founded in 1995, Sonel Workers Credit Union was created to give people a trusted place to save and a fair source of credit. Membership is no longer limited to SONEL staff — we are now open to investors and cooperators from the public. As a licensed microfinance institution regulated under COBAC, MINFI, CEMAC and the NCC, we operate on a simple principle: the members are the owners, and every product and service exists to strengthen their financial wellbeing.'}</p>
          <p>{c?.about_p2 || 'With Deductions at Source plus Express Savings, saving and repaying happens automatically and reliably — so you build wealth and clear credit without the stress of remembering to pay.'}</p>
          <p className="motto">“{c?.motto || 'The energy and satisfaction of our members is our main priority.'}”</p>
        </div>
      </div></section>

      <section className="why section" id="why"><div className="sec-head">
        <div className="sec-eyebrow">{c?.why_eyebrow || 'Why join us'}</div>
        <h2 className="sec-title">{c?.why_title || 'Banking that works for working people'}</h2>
      </div>
        <div className="why-grid">
          {(c?.why_items && c.why_items.length ? c.why_items : DEFAULT_WHY).map((w, i) => (
            <div className="why-item" key={i}><h4>{w.title}</h4><p>{w.body}</p></div>
          ))}
        </div>
      </section>

      <section className="stats"><div className="stats-inner">
        {(c?.stats && c.stats.length ? c.stats : DEFAULT_STATS).map((s, i) => (
          <div className="stat" key={i}><div className="n">{s.n}</div><div className="l">{s.l}</div></div>
        ))}
      </div></section>

      {/* Partner logo strip — links to the full partners page */}
      {partnerLogos.length > 0 && (
        <section className="partner-strip" id="partners">
          <div className="partner-strip-inner">
            <div className="partner-strip-head">{t('partners_strip_title')}</div>
            <div className="partner-strip-logos">
              {partnerLogos.map((p, i) => (
                <img key={i} src={`/partners/${p.logo}`} alt={p.name} title={p.name} loading="lazy" />
              ))}
            </div>
            <button className="btn btn-ghost" onClick={() => nav('/partners')}>{t('partners_strip_cta')}</button>
          </div>
        </section>
      )}

      <section className="cta-band" id="contact"><div className="cta-inner">
        <div><h2>{c?.cta_title || 'Ready to save and borrow with confidence?'}</h2><p>{c?.cta_text || 'Join the cooperators who trust SOWOCCUL with their savings and their goals. Choose the branch closest to you and open an account in minutes.'}</p></div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-white btn-lg" onClick={join}>{c?.cta_primary || 'Become a member'}</button>
          <button className="btn btn-lg" onClick={login} style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)' }}>{c?.cta_secondary || 'Member login'}</button>
        </div>
      </div></section>

      <footer className="footer"><div className="footer-inner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}><LogoMark size={38} /><strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>SONEL Workers Credit Union</strong></div>
          <p className="desc">SOWOCCUL — Deductions at Source plus Express Savings. A licensed microfinance institution (COBAC · MINFI · CEMAC · NCC) serving cooperators since 1995. Open to the public. Save regularly, borrow wisely, repay promptly.</p>
        </div>
        <div><h5>Products &amp; services</h5><a onClick={() => scroll('services')}>Savings accounts</a><a onClick={() => scroll('services')}>Express Savings</a><a onClick={() => scroll('services')}>Loans</a><a onClick={() => scroll('services')}>Transfers</a></div>
        <div><h5>Cooperative</h5><a onClick={() => scroll('about')}>About us</a><a onClick={() => nav('/team')}>Our team</a><a onClick={() => nav('/board')}>Board of Directors</a><a onClick={() => nav('/partners')}>Our partners</a><a onClick={() => nav('/careers')}>Careers</a><a onClick={() => scroll('contact')}>Membership</a></div>
        <div><h5>Branches</h5>
          <a href="/branch/Limbe" target="_blank" rel="noopener noreferrer">Limbe (HQ)</a>
          <a href="/branch/Bamenda" target="_blank" rel="noopener noreferrer">Bamenda</a>
          <a href="/branch/Douala" target="_blank" rel="noopener noreferrer">Douala</a>
          <a href="/branch/Bafoussam" target="_blank" rel="noopener noreferrer">Bafoussam</a>
          <a href="/branch/Yaounde" target="_blank" rel="noopener noreferrer">Yaoundé</a>
          <a href="/branch/Garoua" target="_blank" rel="noopener noreferrer">Garoua</a>
        </div>
      </div>
        <div className="footer-inner" style={{ paddingTop: 0 }}><div className="footer-bottom" style={{ gridColumn: '1/-1', width: '100%' }}>
          <span>© {new Date().getFullYear()} Sonel Workers Credit Union (SOWOCCUL). All rights reserved.</span>
        </div></div>
      </footer>
    </>
  );
}
