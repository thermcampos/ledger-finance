import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Overview', icon: 'bi-grid-1x2', end: true },
  { to: '/transactions', label: 'Transactions', icon: 'bi-list-ul' },
  { to: '/budgets', label: 'Budgets', icon: 'bi-pie-chart' },
  { to: '/accounts', label: 'Accounts', icon: 'bi-wallet2' },
  { to: '/categories', label: 'Categories', icon: 'bi-tags' },
  { to: '/profile', label: 'Profile', icon: 'bi-person' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const initials = (user?.displayName || user?.email || '?')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sidebar">
      <div className="brand">
        <span className="dot" />
        Ledger
      </div>
      <nav>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => 'nav-link-custom' + (isActive ? ' active' : '')}
          >
            <i className={`bi ${link.icon}`} />
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: '12.5px' }}>
          <div
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{
              width: 28,
              height: 28,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 500 }}>
              {user?.displayName || user?.email}
            </div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm w-100" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
