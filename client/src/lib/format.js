/** Formats a whole-FCFA integer with thin spaces, e.g. 1500000 -> "1 500 000". */
export function formatFCFA(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('fr-FR').replace(/\u202f/g, ' ');
}

/** "1 500 000 FCFA" */
export function money(value) {
  return `${formatFCFA(value)} FCFA`;
}

/** ISO or SQLite datetime -> readable date. */
export function formatDate(value, lang = 'en') {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (isNaN(d)) return value;
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric', month: 'short', day: '2-digit',
  });
}

/** Strips non-digits from an amount input string. */
export function digitsOnly(str) {
  return String(str ?? '').replace(/[^\d]/g, '');
}
