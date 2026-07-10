import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, getToken, setSessionEndHandler } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionEndedReason, setSessionEndedReason] = useState(null);

  // When the API layer sees a 401 / revoked session on any request, clear the
  // user so the app falls back to the login screen with a helpful message.
  useEffect(() => {
    setSessionEndHandler(({ revoked }) => {
      setUser(null);
      setSessionEndedReason(revoked ? 'revoked' : 'expired');
    });
  }, []);

  // On load, if we have a token, fetch the profile to confirm it's still valid.
  useEffect(() => {
    let active = true;
    async function restore() {
      if (!getToken()) { setLoading(false); return; }
      try {
        const { user } = await api('/auth/me');
        if (active) setUser(user);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    restore();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (username, password) => {
    const r = await api('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    // 2FA-enabled accounts get a challenge instead of a token; the caller must
    // then call complete2fa with the code. We surface that state upward.
    if (r.twofa_required) {
      return { twofa_required: true, challenge: r.challenge };
    }
    setToken(r.token);
    setUser(r.user);
    setSessionEndedReason(null);
    return r.user;
  }, []);

  const complete2fa = useCallback(async (challenge, code) => {
    const r = await api('/auth/login/2fa', { method: 'POST', body: { challenge, code } });
    setToken(r.token);
    setUser(r.user);
    setSessionEndedReason(null);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const register = useCallback(async (form) => {
    // Registration no longer logs the member in — they must verify their email
    // first. Return the server's response so the page can show the next step.
    const res = await api('/auth/register', { method: 'POST', body: form });
    if (res.token && res.user) {   // backward-compat if verification is ever disabled
      setToken(res.token);
      setUser(res.user);
    }
    return res;
  }, []);

  // Re-fetch the current user from the server (e.g. after a password change,
  // to clear the must_change_password flag and unlock the app).
  const refresh = useCallback(async () => {
    try {
      const { user } = await api('/auth/me');
      setUser(user);
      return user;
    } catch { return null; }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, login, complete2fa, logout, register, refresh,
      sessionEndedReason, clearSessionEnded: () => setSessionEndedReason(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
