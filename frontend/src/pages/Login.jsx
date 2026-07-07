import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand mb-4" style={{ padding: 0 }}>
          <span className="dot" />
          Ledger
        </div>
        <div className="page-title mb-1" style={{ fontSize: 20 }}>
          Sign in
        </div>
        <div className="text-muted-c mb-4" style={{ fontSize: 13 }}>
          Welcome back.
        </div>

        {error && (
          <div className="mb-3" style={{ color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="eyebrow d-block mb-2">Email</label>
            <input
              type="email"
              className="form-control form-control-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="eyebrow d-block mb-2">Password</label>
            <input
              type="password"
              className="form-control form-control-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-jade btn-sm w-100" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="text-muted-c mt-4 text-center" style={{ fontSize: 12.5 }}>
          No account yet? <Link to="/signup">Create one</Link>
        </div>
      </div>
    </div>
  );
}
