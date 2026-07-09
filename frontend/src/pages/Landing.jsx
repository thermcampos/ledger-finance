import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

const FEATURES = [
  {
    icon: 'bi-wallet2',
    title: 'All your accounts, one balance',
    body: 'Checking, savings, credit cards, and investments — tracked side by side, always up to date.',
  },
  {
    icon: 'bi-list-ul',
    title: 'Transactions that just work',
    body: 'Log an expense once. Running balances update automatically, with repeat and installment support built in.',
  },
  {
    icon: 'bi-credit-card',
    title: 'Credit card bills, handled',
    body: 'Due dates and linked payment accounts are tracked for you — no separate spreadsheet required.',
  },
  {
    icon: 'bi-speedometer2',
    title: 'Budgets you can read at a glance',
    body: 'Set a monthly limit per category and see On track, Near limit, or Over budget — plain and simple.',
  },
  {
    icon: 'bi-tag',
    title: 'Categories that make sense',
    body: 'Organize spending your way, with colors that make patterns easy to spot.',
  },
  {
    icon: 'bi-shield-lock',
    title: 'Your data, entered by you',
    body: 'No bank credentials to hand over. Everything is entered directly, and stays yours.',
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <PublicNav />

      <div className="landing-hero">
        <div>
          <div className="page-title" style={{ fontSize: 40, lineHeight: 1.15 }}>
            Your money, laid out like a ledger.
          </div>
          <div className="text-muted-c mt-3" style={{ fontSize: 15.5, maxWidth: 440 }}>
            Track accounts, transactions, credit card bills, and budgets in one place — clear
            numbers, no charts to squint at.
          </div>
          <div className="d-flex align-items-center gap-3 mt-4">
            <Link to="/signup" className="btn btn-jade">
              Create your free account
            </Link>
            <Link to="/login" className="text-muted-c" style={{ fontSize: 13.5, textDecoration: 'none' }}>
              I already have an account
            </Link>
          </div>
        </div>

        <div className="panel p-4">
          <div className="eyebrow mb-2">Current balance</div>
          <div className="hero-balance md">$12,480.32</div>
          <div className="text-muted-c mt-2 mb-4" style={{ fontSize: 12.5 }}>
            across 3 checking &amp; savings accounts
          </div>

          <div className="mb-3">
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: 12.5 }}>
              <span>Groceries</span>
              <span className="mono text-muted-c" style={{ fontSize: 12 }}>
                $340 / $450
              </span>
            </div>
            <div className="track">
              <div className="track-fill" style={{ width: '76%', background: 'var(--jade)' }} />
            </div>
          </div>
          <div>
            <div className="d-flex justify-content-between mb-1" style={{ fontSize: 12.5 }}>
              <span>Dining</span>
              <span className="mono text-muted-c" style={{ fontSize: 12 }}>
                $210 / $220
              </span>
            </div>
            <div className="track">
              <div className="track-fill" style={{ width: '95%', background: 'var(--gold)' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="landing-features">
        <div className="row g-3">
          {FEATURES.map((f) => (
            <div className="col-md-6 col-lg-4" key={f.title}>
              <div className="panel p-4 h-100">
                <div className="account-icon">
                  <i className={`bi ${f.icon} text-muted-c`} />
                </div>
                <div style={{ fontWeight: 500, fontSize: 14.5 }} className="mb-2">
                  {f.title}
                </div>
                <div className="text-muted-c" style={{ fontSize: 13 }}>
                  {f.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="landing-cta">
        <div className="page-title mb-2" style={{ fontSize: 26 }}>
          Get your finances in order.
        </div>
        <div className="text-muted-c mb-4" style={{ fontSize: 14 }}>
          Free to start. No bank credentials, no ads.
        </div>
        <Link to="/signup" className="btn btn-jade">
          Create your free account
        </Link>
      </div>

      <PublicFooter />
    </div>
  );
}
