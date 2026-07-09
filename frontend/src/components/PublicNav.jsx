import { Link } from 'react-router-dom';

export default function PublicNav() {
  return (
    <nav className="landing-nav">
      <Link to="/" className="brand" style={{ padding: 0, textDecoration: 'none', color: 'var(--text)' }}>
        <span className="dot" />
        Ledger
      </Link>
      <div className="d-flex align-items-center gap-3">
        <Link to="/login" className="text-muted-c" style={{ fontSize: 13.5, textDecoration: 'none' }}>
          Log in
        </Link>
        <Link to="/signup" className="btn btn-jade btn-sm">
          Create account
        </Link>
      </div>
    </nav>
  );
}
