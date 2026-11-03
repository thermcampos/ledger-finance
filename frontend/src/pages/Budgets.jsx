import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BudgetsApi, CategoriesApi, AccountsApi, UsersApi } from '../api/ledger';
import { localYearMonth } from '../utils/date';
import { useStickyHeader } from '../hooks/useStickyHeader';
import { iconClassName } from '../constants/categoryIcons';
import BudgetTransactionList from '../components/BudgetTransactionList';

const categoryColors = {
  Groceries: '#4FA98A',
  Housing: '#C9A227',
  Transport: '#6B8FC9',
  Dining: '#C9A227',
  Subscriptions: '#8B92A0',
};

// Status is computed by the backend (BudgetStatus); this only maps it to presentation.
const statusStyles = {
  ON_TRACK: { label: 'On track', cls: 'status-ok', color: 'var(--jade)' },
  NEAR_LIMIT: { label: 'Near limit', cls: 'status-warn', color: 'var(--gold)' },
  OVER_BUDGET: { label: 'Over budget', cls: 'status-over', color: 'var(--red)' },
};

function money(amount) {
  return `$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Budgets() {
  const queryClient = useQueryClient();
  const { sentinelRef, progress, isStuck } = useStickyHeader();
  const yearMonth = localYearMonth();
  const budgetsQuery = useQuery({
    queryKey: ['budgets'],
    queryFn: () => BudgetsApi.list(),
  });
  // Keyed under 'budgets-spend' so every existing invalidation of the month's spend refreshes it.
  const summaryQuery = useQuery({
    queryKey: ['budgets-spend', yearMonth, 'summary'],
    queryFn: () => BudgetsApi.summaryForMonth(yearMonth),
  });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const meQuery = useQuery({ queryKey: ['me'], queryFn: UsersApi.me });
  // Unknown (still loading) counts as on, so the hint never flashes for users who opted in.
  const emailSummariesOff = meQuery.data ? !meQuery.data.emailSummariesEnabled : false;
  const categories = [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name));
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const projectableAccounts = (accountsQuery.data || [])
    .filter((a) => a.kind === 'CHECKING' || a.kind === 'SAVINGS' || a.kind === 'CREDIT_CARD')
    .sort((a, b) => a.name.localeCompare(b.name));

  const budgets = [...(budgetsQuery.data || [])].sort((a, b) =>
    (a.category?.name || '').localeCompare(b.category?.name || '')
  );
  const summaryByBudget = Object.fromEntries(
    (summaryQuery.data?.budgets || []).map((s) => [s.budgetId, s])
  );

  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.limitAmount), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(summaryByBudget[b.id]?.spent || 0), 0);

  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [limitAmount, setLimitAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [dailyEmailSummary, setDailyEmailSummary] = useState(false);

  const resetForm = () => {
    setShowForm(false);
    setCategoryId('');
    setLimitAmount('');
    setAccountId('');
    setDailyEmailSummary(false);
  };

  const upsertMutation = useMutation({
    mutationFn: BudgetsApi.upsert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budgets-spend', yearMonth] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      resetForm();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    upsertMutation.mutate({
      categoryId: Number(categoryId),
      limitAmount: Number(limitAmount),
      accountId: accountId ? Number(accountId) : null,
      dailyEmailSummary,
    });
  };

  const startEdit = (b) => {
    setConfirmingId(null);
    setCategoryId(String(b.category?.id ?? ''));
    setLimitAmount(String(b.limitAmount));
    setAccountId(b.account?.id ? String(b.account.id) : '');
    setDailyEmailSummary(!!b.dailyEmailSummary);
    setShowForm(true);
  };

  const [confirmingId, setConfirmingId] = useState(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: BudgetsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budgets-spend', yearMonth] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setConfirmingId(null);
      if (selectedBudgetId) setSelectedBudgetId(null);
    },
  });

  const cancelDelete = () => {
    setConfirmingId(null);
    deleteMutation.reset();
  };

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId);

  const monthLabel = new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Today included (lastDay − today + 1), computed server-side in the budget zone.
  const daysLeft = summaryQuery.data?.daysLeft ?? '—';

  return (
    <div>
      <div ref={sentinelRef} />
      <div
        className={`sticky-page-header${isStuck ? ' is-stuck' : ''}`}
        style={{ '--header-scale': progress }}
      >
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">{monthLabel}</div>
          <div className="page-title">Budgets</div>
        </div>
        <button className="btn btn-jade btn-sm" onClick={() => setShowForm((s) => !s)}>
          <i className="bi bi-plus-lg me-1" />
          Set budget
        </button>
      </div>
      </div>

      {showForm && (
        <div className="panel p-4 mb-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Category</label>
                <select
                  className="form-select form-select-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Monthly limit</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control form-control-sm"
                  value={limitAmount}
                  onChange={(e) => setLimitAmount(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Project to account</label>
                <select
                  className="form-select form-select-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">None</option>
                  {projectableAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <button type="submit" className="btn btn-jade btn-sm w-100" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div className="col-md-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-100"
                  onClick={resetForm}
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="d-flex flex-wrap align-items-center gap-3 mt-3">
              <label className="eyebrow d-flex align-items-center gap-2 mb-0">
                <input
                  type="checkbox"
                  checked={dailyEmailSummary}
                  onChange={(e) => setDailyEmailSummary(e.target.checked)}
                />
                Daily email summary
              </label>
              {emailSummariesOff && (
                <span className="text-faint" style={{ fontSize: 11.5 }}>
                  Emails are off — <Link to="/profile">turn them on in Profile</Link>
                </span>
              )}
            </div>
          </form>
        </div>
      )}

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
                  {daysLeft}
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
          const summary = summaryByBudget[b.id];
          const spent = Number(summary?.spent || 0);
          const remaining = summary ? Number(summary.left) : Number(b.limitAmount);
          const st = statusStyles[summary?.status] || statusStyles.ON_TRACK;
          const pct = Math.min(Math.max((spent / Number(b.limitAmount)) * 100, 0), 100);
          const color = b.category?.colorHex || categoryColors[b.category?.name] || '#8B92A0';
          return (
            <div className="col-md-6 col-lg-4" key={b.id}>
              <div
                className="budget-card"
                style={{ cursor: spent === 0 ? 'default' : 'pointer' }}
                onClick={() => {
                  if (spent === 0) return;
                  setSelectedBudgetId(b.id);
                }}
              >
                {confirmingId === b.id ? (
                  <div>
                    <div className="budget-name mb-2">Delete budget for &ldquo;{b.category?.name}&rdquo;?</div>
                    <div className="text-faint mb-3" style={{ fontSize: 12.5 }}>
                      This cannot be undone.
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-red btn-sm flex-grow-1"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(b.id)}
                      >
                        {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={cancelDelete}>
                        Cancel
                      </button>
                    </div>
                    {deleteMutation.isError && (
                      <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                        Could not delete this budget.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="budget-name">
                        <span
                          className="txn-icon"
                          style={{ color, width: 28, height: 28, fontSize: 13 }}
                        >
                          <i className={iconClassName(b.category?.icon)} />
                        </span>
                        {b.category?.name}
                        {b.dailyEmailSummary && (
                          <i
                            className="bi bi-envelope text-faint"
                            style={{ fontSize: 12, marginLeft: 6 }}
                            title="Included in the daily email summary"
                            aria-label="Included in the daily email summary"
                          />
                        )}
                      </div>
                      <div className="d-flex gap-1">
                        <button
                          className="icon-btn"
                          title="Edit budget"
                          onClick={(e) => { e.stopPropagation(); startEdit(b); }}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="icon-btn"
                          title="Delete budget"
                          onClick={(e) => { e.stopPropagation(); setConfirmingId(b.id); }}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </div>
                    <div className="budget-figures">
                      {money(spent)} of {money(Number(b.limitAmount))}
                    </div>
                    <div className="track">
                      <div className="track-fill" style={{ width: `${pct}%`, background: st.color }} />
                    </div>
                    <div className="d-flex justify-content-between align-items-baseline" style={{ marginTop: 8 }}>
                      <div className={`budget-status ${st.cls}`} style={{ marginTop: 0 }}>{st.label}</div>
                      <div
                        className="mono"
                        style={{ fontSize: 11.5, color: remaining < 0 ? 'var(--red)' : 'var(--text-muted)' }}
                      >
                        {remaining < 0 ? '-' : ''}{money(remaining)} left
                      </div>
                    </div>
                    {b.account && (
                      <div className="text-faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                        Projects to {b.account.name}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedBudget && (
        <div className="panel p-4 mt-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="eyebrow">{selectedBudget.category?.name} transactions</div>
            <button
              type="button"
              className="icon-btn"
              title="Close"
              onClick={() => setSelectedBudgetId(null)}
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <BudgetTransactionList
            yearMonth={yearMonth}
            categoryId={selectedBudget.category?.id}
          />
        </div>
      )}
    </div>
  );
}
