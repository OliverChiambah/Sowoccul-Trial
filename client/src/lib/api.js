const TOKEN_KEY = 'sowoccul_token';

// In dev, Vite proxies /api to the backend, so a relative base works. In
// production the frontend is served as a static site with no proxy, so set
// VITE_API_BASE at build time to the API's URL (e.g. https://sowoccul-api.onrender.com).
// A Render rewrite rule can also route /api → the API service; in that case the
// relative default is fine and you can leave VITE_API_BASE unset.
const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || '';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Optional hook the app sets so the API layer can force a logout on a revoked
 *  or expired session without importing React context here. */
let onSessionEnd = null;
export function setSessionEndHandler(fn) { onSessionEnd = fn; }

/**
 * Thin fetch wrapper. Adds the auth token, parses JSON, and throws a rich Error
 * on failure carrying: the server's friendly message, .status, .fields (per-
 * field validation messages), and .requestId (for support). Network failures
 * throw a clear "couldn't reach the server" message instead of a raw TypeError.
 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    const err = new Error('Could not reach the server. Check your connection and try again.');
    err.status = 0;
    err.network = true;
    throw err;
  }

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    // A revoked or expired session: clear the token and let the app redirect.
    if (res.status === 401) {
      const revoked = data?.code === 'session_revoked';
      setToken(null);
      if (onSessionEnd) onSessionEnd({ revoked });
    }
    const err = new Error(data?.error || 'Something went wrong.');
    err.status = res.status;
    err.fields = data?.fields || null;       // { field: message } from validation
    err.code = data?.code || null;
    err.email = data?.email || null;         // e.g. for the unverified-email flow
    err.requestId = data?.request_id || res.headers.get('X-Request-Id') || null;
    if (res.status === 429) {
      err.retryAfter = data?.retry_after_seconds || null;
    }
    throw err;
  }
  return data;
}
