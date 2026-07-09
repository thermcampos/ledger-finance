import { Link } from 'react-router-dom';

export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <span className="text-faint" style={{ fontSize: 12 }}>
        &copy; {new Date().getFullYear()} Ledger
      </span>
      <div className="d-flex align-items-center gap-3">
        <Link to="/privacy" className="text-muted-c" style={{ fontSize: 12, textDecoration: 'none' }}>
          Privacy Policy
        </Link>
        <Link to="/terms" className="text-muted-c" style={{ fontSize: 12, textDecoration: 'none' }}>
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
