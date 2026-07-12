import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { BranchesProvider } from './context/BranchesContext.jsx';
import { LangProvider } from './lib/i18n.jsx';
import Layout from './components/Layout.jsx';
// The public landing page loads eagerly — it's the first thing visitors (and
// search engines) see, so we don't want it waiting on a lazy chunk.
import Landing from './pages/Landing.jsx';

// Everything else is code-split: each page downloads only when first visited.
// This keeps the initial bundle small, so the public site loads fast and the
// heavier logged-in pages don't slow down a first-time visitor.
const Team = lazy(() => import('./pages/Team.jsx'));
const Board = lazy(() => import('./pages/Board.jsx'));
const BranchPage = lazy(() => import('./pages/BranchPage.jsx'));
const Careers = lazy(() => import('./pages/Careers.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Deposit = lazy(() => import('./pages/Deposit.jsx'));
const LoanBalance = lazy(() => import('./pages/LoanBalance.jsx'));
const Statement = lazy(() => import('./pages/Statement.jsx'));
const Transfer = lazy(() => import('./pages/Transfer.jsx'));
const MyLoans = lazy(() => import('./pages/MyLoans.jsx'));
const ApplyLoan = lazy(() => import('./pages/ApplyLoan.jsx'));
const AdminLoans = lazy(() => import('./pages/AdminLoans.jsx'));
const AdminMembers = lazy(() => import('./pages/AdminMembers.jsx'));
const AdminContent = lazy(() => import('./pages/AdminContent.jsx'));
const AdminStaff = lazy(() => import('./pages/AdminStaff.jsx'));
const LoginHelp = lazy(() => import('./pages/LoginHelp.jsx'));
const AdminApplications = lazy(() => import('./pages/AdminApplications.jsx'));
const AuditLog = lazy(() => import('./pages/AuditLog.jsx'));
const ChangePassword = lazy(() => import('./pages/ChangePassword.jsx'));
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'));
const VerifyStatement = lazy(() => import('./pages/VerifyStatement.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const AdminCorrections = lazy(() => import('./pages/AdminCorrections.jsx'));
const Directory = lazy(() => import('./pages/Directory.jsx'));
const Approvals = lazy(() => import('./pages/Approvals.jsx'));
const AdminSettings = lazy(() => import('./pages/AdminSettings.jsx'));
const Security = lazy(() => import('./pages/Security.jsx'));

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Admin-created staff must set their own password before doing anything else.
  if (user.must_change_password) return <ChangePassword forced />;
  // If 2FA is now required for this user and they haven't enabled it, staff/admin
  // are walked through setup before reaching anything else (members are prompted
  // more gently, on the dashboard, rather than hard-forced here).
  if (user.twofa_setup_forced) return <Security forced />;
  return children;
}

function RequireStaff({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'member') return <Navigate to="/dashboard" replace />;
  return children;
}

// Operational pages handle member money (deposits, approvals, loans, member
// records). The IT administrator is separated from these — a technical role
// only — so admin is bounced to their dashboard, not shown financial screens.
function RequireOperational({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'staff' && user.role !== 'manager') return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireManagerOrAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin' && user.role !== 'manager') return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BranchesProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="loading" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>…</div>}>
          <Routes>
            <Route path="/" element={<PublicRoute><Landing /></PublicRoute>} />
            <Route path="/team" element={<Team />} />
            <Route path="/board" element={<Board />} />
            <Route path="/branch/:idOrName" element={<BranchPage />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/privacy" element={<LegalPage section="privacy" />} />
            <Route path="/terms" element={<LegalPage section="terms" />} />
            <Route path="/verify" element={<VerifyStatement />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/deposit" element={<Deposit />} />
              <Route path="/loan-balance" element={<LoanBalance />} />
              <Route path="/statement" element={<Statement />} />
              <Route path="/transfer" element={<Transfer />} />
              <Route path="/loans" element={<MyLoans />} />
              <Route path="/apply" element={<ApplyLoan />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/my-data" element={<Navigate to="/profile" replace />} />
              <Route path="/admin/loans" element={<RequireOperational><AdminLoans /></RequireOperational>} />
              <Route path="/admin/members" element={<RequireOperational><AdminMembers /></RequireOperational>} />
              <Route path="/admin/corrections" element={<RequireOperational><AdminCorrections /></RequireOperational>} />
              <Route path="/admin/content" element={<RequireAdmin><AdminContent /></RequireAdmin>} />
              <Route path="/admin/staff" element={<RequireAdmin><AdminStaff /></RequireAdmin>} />
              <Route path="/admin/login-help" element={<RequireAdmin><LoginHelp /></RequireAdmin>} />
              <Route path="/admin/settings" element={<RequireManagerOrAdmin><AdminSettings /></RequireManagerOrAdmin>} />
              <Route path="/directory" element={<RequireStaff><Directory /></RequireStaff>} />
              <Route path="/admin/approvals" element={<RequireOperational><Approvals /></RequireOperational>} />
              <Route path="/admin/audit" element={<RequireManagerOrAdmin><AuditLog /></RequireManagerOrAdmin>} />
              <Route path="/admin/applications" element={<RequireManagerOrAdmin><AdminApplications /></RequireManagerOrAdmin>} />
              <Route path="/account/password" element={<ChangePassword />} />
              <Route path="/account/security" element={<Security />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        </BranchesProvider>
      </AuthProvider>
    </LangProvider>
  );
}
