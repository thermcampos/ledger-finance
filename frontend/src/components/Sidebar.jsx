import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const links = [
  { to: '/', label: 'Overview', icon: 'bi-grid-1x2', end: true },
  { to: '/transactions', label: 'Transactions', icon: 'bi-list-ul' },
  { to: '/budgets', label: 'Budgets', icon: 'bi-pie-chart' },
  { to: '/accounts', label: 'Accounts', icon: 'bi-wallet2' },
  { to: '/credit-cards', label: 'Credit Cards', icon: 'bi-credit-card' },
  { to: '/card-bills', label: 'Card Bills', icon: 'bi-receipt' },
  { to: '/categories', label: 'Categories', icon: 'bi-tags' },
  { to: '/profile', label: 'Profile', icon: 'bi-person' },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const initials = (user?.displayName || user?.email || '?')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`sidebar${isOpen ? ' open' : ''}`}>
      <div className="sidebar-brand-row">
        <div className="brand">
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
        </div>
        <button
          className="btn btn-ghost btn-sm sidebar-close-btn"
          onClick={onClose}
          aria-label="Close menu"
          style={{ padding: '4px 8px' }}
        >
          <i className="bi bi-x" style={{ fontSize: 20 }} />
        </button>
      </div>
      <nav>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => 'nav-link-custom' + (isActive ? ' active' : '')}
            onClick={onClose}
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
        <div className="text-faint mt-2 text-center" style={{ fontSize: 10.5 }}>
          <a
            href="https://lightroasted.vps-kinghost.net/rmcampos/ledger-finance/src/branch/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
          >
              {import.meta.env.VITE_BUILD_NUMBER || 'nightly'}
          </a>
        </div>
      </div>
    </div>
  );
}
