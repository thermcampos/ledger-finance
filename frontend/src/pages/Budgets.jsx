import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BudgetsApi, CategoriesApi } from '../api/ledger';
import { localYearMonth } from '../utils/date';
import { useStickyHeader } from '../hooks/useStickyHeader';

function shiftMonth(yearMonth, delta) {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

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
  const queryClient = useQueryClient();
  const { sentinelRef, isStuck } = useStickyHeader();
  const [yearMonth, setYearMonth] = useState(localYearMonth);
  const budgetsQuery = useQuery({
    queryKey: ['budgets', yearMonth],
    queryFn: () => BudgetsApi.listForMonth(yearMonth),
  });
  const spendQuery = useQuery({
    queryKey: ['budgets-spend', yearMonth],
    queryFn: () => BudgetsApi.spendForMonth(yearMonth),
  });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name));

  const budgets = budgetsQuery.data || [];
  const spendByCategory = Object.fromEntries(
    (spendQuery.data || []).map((s) => [s.categoryId, Number(s.spent)])
  );

  const totalBudgeted = budgets.reduce((s, b) => s + Number(b.limitAmount), 0);
  const totalSpent = budgets.reduce((s, b) => s + (spendByCategory[b.category?.id] || 0), 0);

  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [limitAmount, setLimitAmount] = useState('');

  const upsertMutation = useMutation({
    mutationFn: BudgetsApi.upsert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', yearMonth] });
      queryClient.invalidateQueries({ queryKey: ['budgets-spend', yearMonth] });
      setShowForm(false);
      setCategoryId('');
      setLimitAmount('');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    upsertMutation.mutate({
      categoryId: Number(categoryId),
      month: `${yearMonth}-01`,
      limitAmount: Number(limitAmount),
    });
  };

  const startEdit = (b) => {
    setConfirmingId(null);
    setCategoryId(String(b.category?.id ?? ''));
    setLimitAmount(String(b.limitAmount));
    setShowForm(true);
  };

  const [confirmingId, setConfirmingId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: BudgetsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', yearMonth] });
      queryClient.invalidateQueries({ queryKey: ['budgets-spend', yearMonth] });
      setConfirmingId(null);
    },
  });

  const cancelDelete = () => {
    setConfirmingId(null);
    deleteMutation.reset();
  };

  const monthLabel = new Date(`${yearMonth}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <div ref={sentinelRef} />
      <div className={`sticky-page-header${isStuck ? ' is-stuck' : ''}`}>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1 d-flex align-items-center gap-2">
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px' }}
              onClick={() => setYearMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
            >
              <i className="bi bi-chevron-left" />
            </button>
            {monthLabel}
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px' }}
              onClick={() => setYearMonth((m) => shiftMonth(m, 1))}
              aria-label="Next month"
            >
              <i className="bi bi-chevron-right" />
            </button>
          </div>
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
              <div className="col-md-4">
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
              <div className="col-md-3">
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
              <div className="col-md-2">
                <button type="submit" className="btn btn-jade btn-sm w-100" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
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
                  {yearMonth === localYearMonth()
                    ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() -
                      new Date().getDate()
                    : '—'}
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
          const color = b.category?.colorHex || categoryColors[b.category?.name] || '#8B92A0';
          return (
            <div className="col-md-6 col-lg-4" key={b.id}>
              <div className="budget-card">
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
                        <span className="cat-tick" style={{ background: color }} />
                        {b.category?.name}
                      </div>
                      <div className="d-flex gap-1">
                        <button className="icon-btn" title="Edit budget" onClick={() => startEdit(b)}>
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="icon-btn"
                          title="Delete budget"
                          onClick={() => setConfirmingId(b.id)}
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
                    <div className={`budget-status ${st.cls}`}>{st.label}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
