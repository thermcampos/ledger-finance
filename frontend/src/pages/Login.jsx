import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function Login() {
  const { login, verifyTwoFactor, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // 2FA challenge: the pending token lives only in component state — never in
  // localStorage — so a refresh simply restarts the sign-in.
  const [pendingToken, setPendingToken] = useState(null);
  const [code, setCode] = useState('');
  const [codeType, setCodeType] = useState('TOTP');

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await login(email, password);
      if (response.status === 'TWO_FACTOR_REQUIRED') {
        setPendingToken(response.pendingToken);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleChallengeSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyTwoFactor(pendingToken, code, codeType);
      navigate('/');
    } catch (err) {
      const message = err.response?.data?.message || 'That code is not valid.';
      if (err.response?.status === 401 && /sign in again/i.test(message)) {
        // Challenge expired or exhausted — drop back to the password step.
        setPendingToken(null);
        setCode('');
        setError('That sign-in expired. Please sign in again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchCodeType = (next) => {
    setCodeType(next);
    setCode('');
    setError(null);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand mb-4" style={{ padding: 0 }}>
          <span className="dot" />
          Ledger
        </div>

        {pendingToken === null ? (
          <>
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
          </>
        ) : (
          <>
            <div className="page-title mb-1" style={{ fontSize: 20 }}>
              Two-factor check
            </div>
            <div className="text-muted-c mb-4" style={{ fontSize: 13 }}>
              {codeType === 'TOTP'
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Enter one of your recovery codes.'}
            </div>

            {error && (
              <div className="mb-3" style={{ color: 'var(--red)', fontSize: 13 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleChallengeSubmit}>
              <div className="mb-4">
                <label className="eyebrow d-block mb-2">
                  {codeType === 'TOTP' ? 'Authenticator code' : 'Recovery code'}
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm mono"
                  inputMode={codeType === 'TOTP' ? 'numeric' : 'text'}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder={codeType === 'TOTP' ? '123456' : 'XXXX-XXXX-XXXX'}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-jade btn-sm w-100" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>

            <div className="text-muted-c mt-4 text-center" style={{ fontSize: 12.5 }}>
              {codeType === 'TOTP' ? (
                <>
                  No access to your app?{' '}
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 align-baseline"
                    style={{ fontSize: 12.5 }}
                    onClick={() => switchCodeType('RECOVERY')}
                  >
                    Use a recovery code
                  </button>
                </>
              ) : (
                <>
                  Have your authenticator?{' '}
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 align-baseline"
                    style={{ fontSize: 12.5 }}
                    onClick={() => switchCodeType('TOTP')}
                  >
                    Use an authenticator code
                  </button>
                </>
              )}
            </div>
            <div className="text-muted-c mt-2 text-center" style={{ fontSize: 12.5 }}>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                style={{ fontSize: 12.5 }}
                onClick={() => {
                  setPendingToken(null);
                  setCode('');
                  setError(null);
                }}
              >
                Start over
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
