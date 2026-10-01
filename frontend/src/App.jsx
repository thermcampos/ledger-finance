import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Import from './pages/Import';
import Budgets from './pages/Budgets';
import Accounts from './pages/Accounts';
import CreditCards from './pages/CreditCards';
import CardBills from './pages/CardBills';
import Categories from './pages/Categories';
import Report from './pages/Report';
import Profile from './pages/Profile';

// Defers the location Routes renders against until inside a view
// transition, so the DOM swap (and its before/after snapshots) happens
// as part of document.startViewTransition(). Falls back to an instant
// update when the API isn't supported.
function useTransitionLocation() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);

  useEffect(() => {
    if (location.key === displayLocation.key) return;

    if (typeof document.startViewTransition !== 'function') {
      setDisplayLocation(location);
      return;
    }

    document.startViewTransition(() => {
      flushSync(() => setDisplayLocation(location));
    });
  }, [location, displayLocation]);

  return displayLocation;
}

// unauthenticatedFallback lets "/" show the public Landing page instead of
// redirecting to /login. It must still render via ProtectedLayout itself
// (not a separate wrapper component) so React sees the same element type
// across every protected route — swapping component types at the <Routes>
// position unmounts and remounts everything underneath, including Sidebar,
// which resets its nav-indicator transition state.
function ProtectedLayout({ children, unauthenticatedFallback = <Navigate to="/login" replace /> }) {
  const { isAuthenticated } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isAuthenticated) return unauthenticatedFallback;
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
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="7" y="4" width="4" height="40" rx="2" fill="#4FA98A"/>
              <rect x="13" y="4" width="28" height="40" rx="2" fill="var(--surface-2)"/>
              <rect x="17" y="14" width="20" height="2.5" rx="1.25" fill="#2E3848"/>
              <rect x="17" y="23" width="15" height="2.5" rx="1.25" fill="#2E3848"/>
              <rect x="17" y="32" width="18" height="2.5" rx="1.25" fill="#2E3848"/>
              <rect x="33" y="14" width="4" height="2.5" rx="1.25" fill="#4FA98A" opacity="0.7"/>
              <rect x="33" y="23" width="4" height="2.5" rx="1.25" fill="#4FA98A" opacity="0.7"/>
              <rect x="33" y="32" width="4" height="2.5" rx="1.25" fill="#C75450" opacity="0.8"/>
            </svg>
            Ledger
          </span>
        </div>
        {children}
      </div>
    </>
  );
}

export default function App() {
  const displayLocation = useTransitionLocation();

  return (
    <Routes location={displayLocation}>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      <Route
        path="/"
        element={
          <ProtectedLayout unauthenticatedFallback={<Landing />}>
            <Overview />
          </ProtectedLayout>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedLayout>
            <Transactions />
          </ProtectedLayout>
        }
      />
      <Route
        path="/transactions/import"
        element={
          <ProtectedLayout>
            <Import />
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
        path="/report"
        element={
          <ProtectedLayout>
            <Report />
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
