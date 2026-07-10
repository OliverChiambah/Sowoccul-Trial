/** The SONEL logo mark: globe with a family, cradled by hands. */
export function LogoMark({ size = 42 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="46" r="30" fill="none" stroke="#1E56A0" strokeWidth="3" />
      <ellipse cx="50" cy="46" rx="13" ry="30" fill="none" stroke="#1E56A0" strokeWidth="2" />
      <line x1="20" y1="46" x2="80" y2="46" stroke="#1E56A0" strokeWidth="2" />
      <line x1="24" y1="33" x2="76" y2="33" stroke="#1E56A0" strokeWidth="1.5" />
      <line x1="24" y1="59" x2="76" y2="59" stroke="#1E56A0" strokeWidth="1.5" />
      <g fill="#127A45">
        <circle cx="42" cy="38" r="4" /><rect x="38.5" y="43" width="7" height="12" rx="3" />
        <circle cx="54" cy="36" r="4.5" /><rect x="49.5" y="41" width="9" height="15" rx="3.5" />
        <circle cx="63" cy="40" r="3.2" /><rect x="60" y="44" width="6" height="10" rx="2.5" />
      </g>
      <path d="M22 62 C28 78, 44 84, 50 84 C56 84, 72 78, 78 62 C74 70, 64 74, 50 74 C36 74, 26 70, 22 62Z" fill="#127A45" />
      <path d="M30 60 C24 66, 22 74, 26 80" stroke="#0F5132" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M70 60 C76 66, 78 74, 74 80" stroke="#0F5132" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Logo + wordmark lockup. `light` renders text in white for dark backgrounds. */
export function Wordmark({ size = 40, light = false }) {
  return (
    <div className="lp-brand">
      <span style={{ display: 'inline-flex' }}><LogoMark size={size} /></span>
      <span className="wm">
        <span className="n" style={light ? { color: '#fff' } : undefined}>SONEL Workers Credit Union</span><br />
        <span className="s" style={light ? { color: 'rgba(255,255,255,0.8)' } : undefined}>SOWOCCUL · Since 1995</span>
      </span>
    </div>
  );
}
