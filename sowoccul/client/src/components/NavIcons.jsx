// Compact, consistent line-icons for the account sidebar. Each is a 20x20 SVG
// path drawn on a 24-viewBox, stroke-based so it inherits `currentColor`. Kept
// deliberately simple and uniform in weight so the menu reads as one family.
import React from 'react';

const S = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', width: 20, height: 20 };

export const NavIcons = {
  // Member / banking
  dashboard: (p) => <svg {...S} {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  deposit: (p) => <svg {...S} {...p}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>,
  loanbal: (p) => <svg {...S} {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 1.5 1.4 2 3 2.4 1.6.4 3 1 3 2.5 0 1.4-1.3 2.3-3 2.3s-3-1-3-2.5"/></svg>,
  statement: (p) => <svg {...S} {...p}><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>,
  transfer: (p) => <svg {...S} {...p}><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>,
  loans: (p) => <svg {...S} {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>,
  apply: (p) => <svg {...S} {...p}><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6"/><path d="M12 12v5M9.5 14.5h5"/></svg>,
  my_data: (p) => <svg {...S} {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>,
  // Staff / admin
  directory: (p) => <svg {...S} {...p}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5"/><path d="M16 4.5a3 3 0 0 1 0 6M18.5 20c0-2.4-1-4-2.6-4.6"/></svg>,
  approvals: (p) => <svg {...S} {...p}><path d="M12 3 4 6v5c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>,
  admin_loans: (p) => <svg {...S} {...p}><path d="M4 5h16M4 5v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5"/><path d="M9 10h6M9 14h4"/></svg>,
  admin_members: (p) => <svg {...S} {...p}><circle cx="8" cy="8" r="3.2"/><path d="M2.5 20c0-3.2 2.4-5 5.5-5s5.5 1.8 5.5 5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15.5 20c0-2 .8-3.6 2-4.4"/></svg>,
  admin_corrections: (p) => <svg {...S} {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
  admin_content: (p) => <svg {...S} {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/></svg>,
  admin_staff: (p) => <svg {...S} {...p}><circle cx="12" cy="7" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/><path d="m19 3 1 2 2 .5-1.5 1.5.4 2-1.9-1-1.9 1 .4-2L18 5.5 20 5Z" strokeWidth="1.2"/></svg>,
  settings: (p) => <svg {...S} {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>,
  admin_audit: (p) => <svg {...S} {...p}><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 14 2.5 2.5L16 11"/></svg>,
  // Account
  change_password: (p) => <svg {...S} {...p}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/></svg>,
  security: (p) => <svg {...S} {...p}><path d="M12 3 5 6v5c0 4.5 3 7.6 7 9 4-1.4 7-4.5 7-9V6Z"/><path d="M12 8v4M12 15.5h.01"/></svg>,
};

export function NavIcon({ name, ...props }) {
  const Ico = NavIcons[name];
  return Ico ? Ico(props) : null;
}
