import { useQueries, useQuery } from '@tanstack/react-query';
import { AccountsApi, BudgetsApi, TransactionsApi } from '../api/ledger';

function statusColor(spent, limit) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  if (pct >= 100) return { label: 'Over budget', color: 'var(--red)' };
  if (pct >= 85) return { label: 'Near limit', color: 'var(--gold)' };
  return { label: 'On track', color: 'var(--jade)' };
}

const categoryColors = {
  Groceries: '#4FA98A',
  Housing: '#C9A227',
  Transport: '#6B8FC9',
  Income: '#4FA98A',
  Dining: '#C9A227',
  Subscriptions: '#8B92A0',
  Transfer: '#8B92A0',
  Salary: '#4FA98A',
};

function money(amount, { signed = false } = {}) {
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : signed ? '+' : '';
  return `${sign}$${value}`;
}

export default function Overview() {
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = accountsQuery.data || [];

  const yearMonth = new Date().toISOString().slice(0, 7);
  const budgetsQuery = useQuery({
    queryKey: ['budgets', yearMonth],
    queryFn: () => BudgetsApi.listForMonth(yearMonth),
  });
  const spendQuery = useQuery({
    queryKey: ['budgets-spend', yearMonth],
    queryFn: () => BudgetsApi.spendForMonth(yearMonth),
  });
  const budgets = budgetsQuery.data || [];
  const spendByCategory = Object.fromEntries(
    (spendQuery.data || []).map((s) => [s.categoryId, Number(s.spent)])
  );

  const txnQueries = useQueries({
    queries: accounts.map((a) => ({
      queryKey: ['transactions', a.id],
      queryFn: () => TransactionsApi.listByAccount(a.id),
      enabled: !!a.id,
    })),
  });

  const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const recent = txnQueries
    .flatMap((q) => q.data || [])
    .sort((a, b) => new Date(b.occurredOn) - new Date(a.occurredOn))
    .slice(0, 5);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="page-title">Overview</div>
        </div>
        <button className="btn btn-ghost btn-sm">
          <i className="bi bi-calendar3 me-1" />
          This month
        </button>
      </div>

      <div className="panel p-4 mb-4">
        <div className="eyebrow mb-2">Total balance</div>
        {accountsQuery.isLoading ? (
          <div className="text-muted-c">Loading…</div>
        ) : (
          <>
            <div className="hero-balance">{money(totalBalance)}</div>
            <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
              across {accounts.length} account{accounts.length === 1 ? '' : 's'}
            </div>
          </>
        )}
      </div>

      <div className="row g-3 mb-4">
        {accounts.map((a) => (
          <div className="col-6 col-md-3" key={a.id}>
            <div className="acct-card">
              <div className="acct-kind">{a.kind?.replace('_', ' ')}</div>
              <div className="acct-balance" style={{ color: a.balance < 0 ? 'var(--red)' : undefined }}>
                {money(Number(a.balance))}
              </div>
              <div className="acct-name">{a.name}</div>
            </div>
          </div>
        ))}
        {accounts.length === 0 && !accountsQuery.isLoading && (
          <div className="col-12 text-muted-c" style={{ fontSize: 13 }}>
            No accounts yet — add one from the Accounts page to get started.
          </div>
        )}
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Recent activity</div>
            </div>
            {recent.length === 0 ? (
              <div className="p-4 text-muted-c" style={{ fontSize: 13 }}>
                No transactions yet.
              </div>
            ) : (
              recent.map((t) => (
                <div className="feed-row" key={t.id}>
                  <div className="feed-left">
                    <span
                      className="cat-tick"
                      style={{ background: categoryColors[t.category?.name] || '#8B92A0' }}
                    />
                    <span className="feed-desc">{t.description}</span>
                  </div>
                  <span className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                    {money(Number(t.amount), { signed: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="panel p-4">
            <div className="panel-title mb-3">Budgets this month</div>
            {budgetsQuery.isLoading ? (
              <div className="text-muted-c" style={{ fontSize: 13 }}>
                Loading…
              </div>
            ) : budgets.length === 0 ? (
              <div className="text-muted-c" style={{ fontSize: 13 }}>
                No budgets set for this month yet.
              </div>
            ) : (
              budgets.map((b) => {
                const spent = spendByCategory[b.category?.id] || 0;
                const limit = Number(b.limitAmount);
                const st = statusColor(spent, limit);
                const pct = Math.min((spent / limit) * 100, 100);
                return (
                  <div key={b.id} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: 12.5 }}>
                      <span className="d-flex align-items-center gap-2">
                        <span className="cat-tick" style={{ background: b.category?.colorHex || '#8B92A0' }} />
                        {b.category?.name}
                      </span>
                      <span className="mono text-muted-c" style={{ fontSize: 12 }}>
                        {money(spent)} / {money(limit)}
                      </span>
                    </div>
                    <div className="track">
                      <div className="track-fill" style={{ width: `${pct}%`, background: st.color }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
