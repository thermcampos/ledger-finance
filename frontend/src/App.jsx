import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Budgets from './pages/Budgets';
import Accounts from './pages/Accounts';
import CreditCards from './pages/CreditCards';
import Categories from './pages/Categories';
import Profile from './pages/Profile';

function ProtectedLayout({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <Sidebar />
      <div className="main">{children}</div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route
        path="/"
        element={
          <ProtectedLayout>
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
