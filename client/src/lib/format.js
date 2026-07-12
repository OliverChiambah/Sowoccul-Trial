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
  const d = toDate(value);
  if (!d || isNaN(d)) return typeof value === 'string' ? value : '—';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric', month: 'short', day: '2-digit',
  });
}

/**
 * ISO or SQLite datetime -> readable date AND time (e.g. "12 Jul 2026, 18:00").
 * Handles all the shapes created_at can arrive in: a real Date object, an ISO
 * string ("2026-07-12T18:00:00.000Z"), or a space-separated SQL string
 * ("2026-07-12 18:00:00", treated as UTC).
 */
export function formatDateTime(value, lang = 'en') {
  if (!value) return '—';
  const d = toDate(value);
  if (!d || isNaN(d)) return typeof value === 'string' ? value : '—';
  return d.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Turn whatever the API gave us into a Date. Accepts a Date, an ISO string, or a
 * space-separated SQL timestamp (assumed UTC, so a 'Z' is added). Never throws.
 */
function toDate(value) {
  if (value instanceof Date) return value;
  const s = String(value);
  // Already ISO (has a 'T' or a timezone marker) — parse as-is.
  if (/[T]/.test(s) || /[Z+]/.test(s.slice(10))) return new Date(s);
  // Space-separated SQL form "YYYY-MM-DD HH:MM:SS" — normalise to ISO UTC.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  return new Date(s);
}

/** Strips non-digits from an amount input string. */
export function digitsOnly(str) {
  return String(str ?? '').replace(/[^\d]/g, '');
}
