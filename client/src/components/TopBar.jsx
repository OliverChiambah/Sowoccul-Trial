import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { Wordmark } from './Brand.jsx';

export default function TopBar() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();

  return (
    <header className="topbar">
      <Wordmark size={38} />
      <div className="topbar-right">
        <div className="lang-toggle" data-lang={lang}>
          <span className="pill" />
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
        </div>
        {user && (
          <>
            <div className="topbar-user">
              <div className="nm">{user.full_name}</div>
              <div className="rl">{user.role}</div>
            </div>
            <button className="btn-logout" onClick={logout}>{t('logout')}</button>
          </>
        )}
      </div>
    </header>
  );
}
