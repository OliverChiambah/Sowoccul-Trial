import { NavLink, Outlet } from 'react-router-dom';
import TopBar from './TopBar.jsx';
import IdleTimeout from './IdleTimeout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../lib/i18n.jsx';
import { NavIcon } from './NavIcons.jsx';

export default function Layout() {
  const { user } = useAuth();
  const { t } = useLang();
  const isStaff = user && (user.role === 'staff' || user.role === 'manager' || user.role === 'admin');
  const isAdmin = user && user.role === 'admin';
  const isManagerOrAdmin = user && (user.role === 'admin' || user.role === 'manager');
  // Operational = handles member money (staff & General Manager). The IT admin is
  // deliberately excluded — it's a technical role, separated from member money.
  const isOperational = user && (user.role === 'staff' || user.role === 'manager');

  // Each item carries a `tone` that colours its icon chip and active state.
  // Colour encodes the section: green = your banking, blue = staff tools,
  // slate = account & security. So the palette means something, it isn't decoration.
  const Item = ({ to, icon, label, tone }) => (
    <NavLink to={to} className={({ isActive }) => 'nav-link tone-' + tone + (isActive ? ' active' : '')}>
      <span className="nav-ico"><NavIcon name={icon} /></span>
      <span className="nav-label">{label}</span>
    </NavLink>
  );

  return (
    <>
      <TopBar />
      <IdleTimeout />
      <div className="layout">
        <nav className="sidenav">
          <div className="nav-group-label">{t('nav_group_banking') || 'Banking'}</div>
          <Item to="/dashboard" icon="dashboard" tone="green" label={t('nav_dashboard')} />
          {!isAdmin && <Item to="/deposit" icon="deposit" tone="green" label={t('nav_deposit')} />}
          {!isAdmin && <Item to="/loan-balance" icon="loanbal" tone="green" label={t('nav_loanbal')} />}
          {!isAdmin && <Item to="/statement" icon="statement" tone="green" label={t('nav_statement')} />}
          {!isAdmin && <Item to="/transfer" icon="transfer" tone="green" label={t('nav_transfer')} />}
          {!isAdmin && <Item to="/loans" icon="loans" tone="green" label={t('nav_loans')} />}
          {!isAdmin && <Item to="/apply" icon="apply" tone="green" label={t('nav_apply')} />}
          <Item to="/profile" icon="my_data" tone="green" label={t('nav_profile')} />

          {isOperational && (
            <>
              <div className="nav-group-label">{t('nav_group_staff') || 'Staff tools'}</div>
              <Item to="/directory" icon="directory" tone="blue" label={t('nav_directory')} />
              <Item to="/admin/approvals" icon="approvals" tone="blue" label={t('nav_approvals')} />
              <Item to="/admin/loans" icon="admin_loans" tone="blue" label={t('nav_admin_loans')} />
              <Item to="/admin/members" icon="admin_members" tone="blue" label={t('nav_admin_members')} />
              <Item to="/admin/corrections" icon="admin_corrections" tone="blue" label={t('nav_admin_corrections')} />
              {isManagerOrAdmin && <Item to="/admin/audit" icon="admin_audit" tone="blue" label={t('nav_admin_audit')} />}
              {user.role === 'manager' && <Item to="/admin/applications" icon="apply" tone="blue" label={t('nav_applications')} />}
              {user.role === 'manager' && <Item to="/admin/settings" icon="settings" tone="blue" label={t('nav_settings')} />}
            </>
          )}

          {isAdmin && (
            <>
              <div className="nav-group-label">{t('nav_group_admin') || 'Administration'}</div>
              <Item to="/directory" icon="directory" tone="blue" label={t('nav_directory')} />
              <Item to="/admin/staff" icon="admin_staff" tone="blue" label={t('nav_admin_staff')} />
              <Item to="/admin/login-help" icon="security" tone="blue" label={t('nav_login_help')} />
              <Item to="/admin/applications" icon="apply" tone="blue" label={t('nav_applications')} />
              <Item to="/admin/settings" icon="settings" tone="blue" label={t('nav_settings')} />
              <Item to="/admin/content" icon="admin_content" tone="blue" label={t('nav_admin_content')} />
              <Item to="/admin/audit" icon="admin_audit" tone="blue" label={t('nav_admin_audit')} />
            </>
          )}

          <div className="nav-group-label">{t('nav_group_account') || 'Account'}</div>
          <Item to="/account/password" icon="change_password" tone="slate" label={t('nav_change_password')} />
          <Item to="/account/security" icon="security" tone="slate" label={t('nav_security')} />
        </nav>
        <main><Outlet /></main>
      </div>
    </>
  );
}
