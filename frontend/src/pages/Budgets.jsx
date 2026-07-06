import { useQuery } from '@tanstack/react-query';
import { BudgetsApi } from '../api/ledger';

const categoryColors = {
  Groceries: '#4FA98A',
  Housing: '#C9A227',
  Transport: '#6B8FC9',
  Dining: '#C9A227',
  Subscriptions: '#8B92A0',
};

function statusFor(spent, limit) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  if (pct >= 100) return { label: 'Over budget', cls: 'status-over', color: 'var(--red)' };
  if (pct >= 85) return { label: 'Near limit', cls: 'status-warn', color: 'var(--gold)' };
  return { label: 'On track', cls: 'status-ok', color: 'var(--jade)' };
}

function money(amount) {
  return `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Budgets() {
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

  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.limitAmount), 0);
  const totalSpent = Object.values(spendByCategory).reduce((s, v) => s + v, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="page-title">Budgets</div>
        </div>
        <button className="btn btn-ghost btn-sm">
          <i className="bi bi-pencil me-1" />
          Edit budgets
        </button>
      </div>

      <div className="panel p-4 mb-4">
        <div className="row align-items-end g-3">
          <div className="col-md-5">
            <div className="eyebrow mb-2">Budgeted this month</div>
            <div className="hero-balance md">{money(totalBudgeted)}</div>
          </div>
          <div className="col-md-7">
            <div className="row g-3 text-center text-md-start">
              <div className="col-4">
                <div className="eyebrow mb-1">Spent</div>
                <div className="mono" style={{ fontSize: 16 }}>
                  {money(totalSpent)}
                </div>
              </div>
              <div className="col-4">
                <div className="eyebrow mb-1">Remaining</div>
                <div className="mono" style={{ fontSize: 16, color: 'var(--jade)' }}>
                  {money(totalBudgeted - totalSpent)}
                </div>
              </div>
              <div className="col-4">
                <div className="eyebrow mb-1">Days left</div>
                <div className="mono" style={{ fontSize: 16 }}>
                  {new Date(
                    new Date().getFullYear(),
                    new Date().getMonth() + 1,
                    0
                  ).getDate() - new Date().getDate()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {budgetsQuery.isLoading && <div className="text-muted-c">Loading…</div>}

      {!budgetsQuery.isLoading && budgets.length === 0 && (
        <div className="panel p-4 text-muted-c" style={{ fontSize: 13 }}>
          No budgets set for this month yet.
        </div>
      )}

      <div className="row g-3">
        {budgets.map((b) => {
          const spent = spendByCategory[b.category?.id] || 0;
          const st = statusFor(spent, Number(b.limitAmount));
          const pct = Math.min((spent / Number(b.limitAmount)) * 100, 100);
          const color = categoryColors[b.category?.name] || '#8B92A0';
          return (
            <div className="col-md-6 col-lg-4" key={b.id}>
              <div className="budget-card">
                <div className="budget-name">
                  <span className="cat-tick" style={{ background: color }} />
                  {b.category?.name}
                </div>
                <div className="budget-figures">
                  {money(spent)} of {money(Number(b.limitAmount))}
                </div>
                <div className="track">
                  <div className="track-fill" style={{ width: `${pct}%`, background: st.color }} />
                </div>
                <div className={`budget-status ${st.cls}`}>{st.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
