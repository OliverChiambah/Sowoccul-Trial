import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';

// Timing. Total idle allowed before logout, and how long before that we warn.
const IDLE_LIMIT_MS = 30 * 60 * 1000;   // 30 minutes
const WARN_BEFORE_MS = 5 * 60 * 1000;   // warn when 5 minutes remain
const TICK_MS = 1000;                   // countdown update interval

/**
 * Logs the signed-in user out after 30 minutes with no activity, and shows a
 * warning with a live countdown for the final 5 minutes. Any real activity
 * (mouse, keyboard, touch, scroll) before the countdown resets the timer.
 *
 * Only mounts inside the authenticated area, so it never runs on public pages
 * or the login screen. The countdown is driven off a single "last activity"
 * timestamp so background-tab throttling can't let the session outlive the limit.
 */
export default function IdleTimeout() {
  const { user, endSessionIdle } = useAuth();
  const { t } = useLang();
  const [warning, setWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(WARN_BEFORE_MS);
  const lastActivity = useRef(Date.now());
  const intervalRef = useRef(null);

  // Record activity — but ignore events while the warning is up, so the user
  // must explicitly choose to stay (a stray mouse move shouldn't silently keep
  // them signed in without their knowledge).
  const bump = useCallback(() => {
    if (warning) return;
    lastActivity.current = Date.now();
  }, [warning]);

  const staySignedIn = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    intervalRef.current = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      const remaining = IDLE_LIMIT_MS - idle;

      if (remaining <= 0) {
        endSessionIdle();
        return;
      }
      if (remaining <= WARN_BEFORE_MS) {
        setWarning(true);
        setRemainingMs(remaining);
      } else if (warning) {
        // Activity elsewhere pushed us back out of the warning window.
        setWarning(false);
      }
    }, TICK_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, bump, warning, endSessionIdle]);

  if (!user || !warning) return null;

  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  return (
    <div className="idle-overlay" role="alertdialog" aria-modal="true" aria-labelledby="idleTitle" aria-describedby="idleBody">
      <div className="idle-card">
        <div className="idle-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="var(--amber, #b7791f)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>
        <h2 id="idleTitle" className="idle-title">{t('idle_title')}</h2>
        <p id="idleBody" className="idle-body">{t('idle_body')}</p>
        <div className="idle-countdown" aria-live="assertive">{mm}:{ss}</div>
        <div className="idle-actions">
          <button className="btn btn-primary" onClick={staySignedIn}>{t('idle_stay')}</button>
          <button className="btn btn-ghost" onClick={endSessionIdle}>{t('idle_logout_now')}</button>
        </div>
      </div>
    </div>
  );
}
