import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Budgets from './pages/Budgets';
import Accounts from './pages/Accounts';
import CreditCards from './pages/CreditCards';
import CardBills from './pages/CardBills';
import Categories from './pages/Categories';
import Profile from './pages/Profile';

function ProtectedLayout({ children }) {
  const { isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="main">
        <div className="mobile-header">
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: '4px 8px' }}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <i className="bi bi-list" style={{ fontSize: 20 }} />
          </button>
          <span className="brand" style={{ padding: 0 }}>
            <span className="dot" />
            Ledger
          </span>
        </div>
        {children}
      </div>
    </>
  );
}

// Logged-in visitors go straight into the app at "/", same as before this
// page existed; logged-out visitors see the public landing page instead of
// being redirected straight to /login.
function Root() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Landing />;
  return (
    <ProtectedLayout>
      <Overview />
    </ProtectedLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      <Route path="/" element={<Root />} />
      <Route
        path="/transactions"
        element={
          <ProtectedLayout>
            <Transactions />
          </ProtectedLayout>
        }
      />
      <Route
        path="/budgets"
        element={
          <ProtectedLayout>
            <Budgets />
          </ProtectedLayout>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedLayout>
            <Accounts />
          </ProtectedLayout>
        }
      />
      <Route
        path="/credit-cards"
        element={
          <ProtectedLayout>
            <CreditCards />
          </ProtectedLayout>
        }
      />
      <Route
        path="/card-bills"
        element={
          <ProtectedLayout>
            <CardBills />
          </ProtectedLayout>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedLayout>
            <Categories />
          </ProtectedLayout>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedLayout>
            <Profile />
          </ProtectedLayout>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
