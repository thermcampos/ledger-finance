import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi, CategoriesApi, TransactionsApi } from '../api/ledger';
import { parseLocalDate } from '../utils/date';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseSignedAmount(raw) {
  const trimmed = raw.trim();
  const value = Math.abs(Number(trimmed.startsWith('+') ? trimmed.slice(1) : trimmed));
  return trimmed.startsWith('+') ? value : -value;
}

// Inverse of parseSignedAmount — round-trips a stored amount back into the
// same "+income / -expense" text format the input expects.
function formatSignedAmount(amount) {
  const num = Number(amount);
  return num >= 0 ? `+${num}` : `${num}`;
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
const categoryIcons = {
  Groceries: 'bi-basket2',
  Housing: 'bi-house',
  Transport: 'bi-fuel-pump',
  Income: 'bi-arrow-down-left',
  Dining: 'bi-cup-hot',
  Subscriptions: 'bi-repeat',
  Transfer: 'bi-arrow-left-right',
  Salary: 'bi-arrow-down-left',
};

function money(amount, { signed = false } = {}) {
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : signed ? '+' : '';
  return `${sign}$${value}`;
}

function rangeCutoff(range) {
  const now = new Date();
  if (range === '90') {
    now.setDate(now.getDate() - 90);
    return now;
  }
  if (range === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }
  now.setDate(now.getDate() - 30);
  return now;
}

function toCsv(rows) {
  const header = ['Date', 'Description', 'Category', 'Account', 'Amount', 'Running balance'];
  const lines = rows.map((t) => [
    t.occurredOn,
    t.description,
    t.category?.name || 'Uncategorized',
    t.account?.name || '',
    t.amount,
    t.runningBalance,
  ]);
  return [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dayLabel(dateStr) {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return `Today · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  if (sameDay(date, yesterday))
    return `Yesterday · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Transactions() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterRange, setFilterRange] = useState('30');
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = accountsQuery.data || [];
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = categoriesQuery.data || [];

  const [showForm, setShowForm] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayIso());

  const createMutation = useMutation({
    mutationFn: TransactionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowForm(false);
      setAccountId('');
      setCategoryId('');
      setDescription('');
      setAmount('');
      setOccurredOn(todayIso());
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      accountId: Number(accountId),
      categoryId: categoryId ? Number(categoryId) : null,
      description,
      amount: parseSignedAmount(amount),
      occurredOn,
    });
  };

  const [editingId, setEditingId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editOccurredOn, setEditOccurredOn] = useState('');

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => TransactionsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setEditingId(null);
    },
  });

  const startEdit = (t) => {
    setConfirmingId(null);
    setEditingId(t.id);
    setEditCategoryId(t.category?.id ? String(t.category.id) : '');
    setEditDescription(t.description);
    setEditAmount(formatSignedAmount(t.amount));
    setEditOccurredOn(t.occurredOn);
  };

  const handleEditSubmit = (e, id) => {
    e.preventDefault();
    updateMutation.mutate({
      id,
      payload: {
        categoryId: editCategoryId ? Number(editCategoryId) : null,
        description: editDescription,
        amount: parseSignedAmount(editAmount),
        occurredOn: editOccurredOn,
      },
    });
  };

  const [confirmingId, setConfirmingId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: TransactionsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setConfirmingId(null);
    },
  });

  const cancelDelete = () => {
    setConfirmingId(null);
    deleteMutation.reset();
  };

  const txnQueries = useQueries({
    queries: accounts.map((a) => ({
      queryKey: ['transactions', a.id],
      queryFn: () => TransactionsApi.listByAccount(a.id),
      enabled: !!a.id,
    })),
  });

  const accountById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  // Chronologically sorted per-account transactions (unfiltered by search/category),
  // used to look up "balance as of a given day" regardless of which rows are
  // currently visible under the active filters.
  const sortedTxnsByAccount = useMemo(() => {
    const map = new Map();
    accounts.forEach((a, i) => {
      const raw = txnQueries[i]?.data || [];
      const sorted = [...raw].sort((x, y) => {
        const diff = parseLocalDate(x.occurredOn) - parseLocalDate(y.occurredOn);
        return diff !== 0 ? diff : x.id - y.id;
      });
      map.set(a.id, sorted);
    });
    return map;
  }, [accounts, txnQueries]);

  function accountBalanceAsOf(account, cutoffDate) {
    const sorted = sortedTxnsByAccount.get(account.id) || [];
    let balance = Number(account.openingBalance ?? 0);
    for (const t of sorted) {
      if (parseLocalDate(t.occurredOn) > cutoffDate) break;
      balance = Number(t.runningBalance);
    }
    return balance;
  }

  function balanceAsOfDay(cutoffDate) {
    const relevantAccounts = filterAccountId
      ? accounts.filter((a) => String(a.id) === filterAccountId)
      : accounts;
    return relevantAccounts.reduce((sum, a) => sum + accountBalanceAsOf(a, cutoffDate), 0);
  }

  const currentBalanceTotal = filterAccountId
    ? Number(accountById[filterAccountId]?.balance || 0)
    : accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  const filteredCategoryName = categories.find((c) => String(c.id) === filterCategoryId)?.name;

  const filteredFlat = useMemo(() => {
    const cutoff = rangeCutoff(filterRange);
    return txnQueries
      .flatMap((q) => q.data || [])
      .filter((t) => t.description.toLowerCase().includes(search.toLowerCase()))
      .filter((t) => !filterAccountId || String(t.account?.id) === filterAccountId)
      .filter((t) => !filterCategoryId || String(t.category?.id) === filterCategoryId)
      .filter((t) => parseLocalDate(t.occurredOn) >= cutoff)
      .sort((a, b) => parseLocalDate(b.occurredOn) - parseLocalDate(a.occurredOn));
  }, [txnQueries, search, filterAccountId, filterCategoryId, filterRange]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of filteredFlat) {
      const label = dayLabel(t.occurredOn);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }
    return Array.from(map.entries());
  }, [filteredFlat]);

  const filteredCategoryTotal = filteredFlat.reduce((sum, t) => sum + Number(t.amount), 0);

  const handleExport = () => {
    downloadCsv(toCsv(filteredFlat), `transactions-${todayIso()}.csv`);
  };

  const isLoading = accountsQuery.isLoading || txnQueries.some((q) => q.isLoading);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">All accounts</div>
          <div className="page-title">Transactions</div>
        </div>
        <button className="btn btn-jade btn-sm" onClick={() => setShowForm((s) => !s)}>
          <i className="bi bi-plus-lg me-1" />
          Add transaction
        </button>
      </div>

      <div className="panel p-4 mb-4">
        <div className="row g-3">
          <div className={filterCategoryId ? 'col-md-7' : 'col-md-12'}>
            <div className="eyebrow mb-2">
              Current balance{filterAccountId ? ` — ${accountById[filterAccountId]?.name}` : ''}
            </div>
            <div className="hero-balance md" style={{ color: currentBalanceTotal < 0 ? 'var(--red)' : undefined }}>
              {money(currentBalanceTotal)}
            </div>
            {(filterCategoryId || search) && (
              <div className="text-faint mt-1" style={{ fontSize: 11.5 }}>
                Your real balance — not limited to the category/search filter below.
              </div>
            )}
          </div>
          {filterCategoryId && (
            <div className="col-md-5">
              <div className="eyebrow mb-2">{filteredCategoryName || 'Category'} total</div>
              <div
                className="mono"
                style={{ fontSize: 26, color: filteredCategoryTotal < 0 ? 'var(--red)' : 'var(--jade)' }}
              >
                {money(filteredCategoryTotal, { signed: true })}
              </div>
              <div className="text-faint mt-1" style={{ fontSize: 11.5 }}>
                Sum of currently filtered transactions.
              </div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="panel p-4 mb-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3 align-items-end">
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Account</label>
                <select
                  className="form-select form-select-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Category</label>
                <select
                  className="form-select form-select-sm"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Description</label>
                <input
                  className="form-control form-control-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Amount (+ for income)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-control form-control-sm"
                  placeholder="12.50 or +12.50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-2">
                <label className="eyebrow d-block mb-2">Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-1">
                <button type="submit" className="btn btn-jade btn-sm w-100" disabled={createMutation.isPending}>
                  {createMutation.isPending ? '…' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="panel p-3 mb-3">
        <div className="row g-2 align-items-center">
          <div className="col-md-4">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search transactions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={filterAccountId}
              onChange={(e) => setFilterAccountId(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={filterRange}
              onChange={(e) => setFilterRange(e.target.value)}
            >
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="year">This year</option>
            </select>
          </div>
          <div className="col-md-2 text-md-end">
            <button className="btn btn-ghost btn-sm w-100 w-md-auto" onClick={handleExport}>
              <i className="bi bi-download me-1" />
              Export
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="text-muted-c">Loading…</div>}

      {!isLoading && grouped.length === 0 && (
        <div className="panel p-4 text-muted-c" style={{ fontSize: 13 }}>
          No transactions yet.
        </div>
      )}

      {grouped.map(([label, items]) => {
        const dayBalance = balanceAsOfDay(parseLocalDate(items[0].occurredOn));
        return (
          <div key={label} className="mb-1">
            <div className="day-heading">
              <div className="eyebrow">{label}</div>
              <div className="day-total" style={{ color: dayBalance < 0 ? 'var(--red)' : undefined }}>
                {money(dayBalance)}
              </div>
            </div>
            {items.map((t) => {
              const catName = t.category?.name;
              const icon = categoryIcons[catName] || 'bi-dot';
              const color = t.category?.colorHex || categoryColors[catName] || '#8B92A0';
              return (
                <div className="txn-row" key={t.id}>
                  {editingId === t.id ? (
                    <form
                      onSubmit={(e) => handleEditSubmit(e, t.id)}
                      className="d-flex align-items-center gap-2 flex-wrap w-100"
                    >
                      <select
                        className="form-select form-select-sm"
                        style={{ maxWidth: 150 }}
                        value={editCategoryId}
                        onChange={(e) => setEditCategoryId(e.target.value)}
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="form-control form-control-sm"
                        style={{ maxWidth: 180 }}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        required
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        className="form-control form-control-sm"
                        style={{ maxWidth: 110 }}
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        required
                      />
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        style={{ maxWidth: 150 }}
                        value={editOccurredOn}
                        onChange={(e) => setEditOccurredOn(e.target.value)}
                        required
                      />
                      <div className="d-flex gap-2 ms-auto">
                        <button type="submit" className="btn btn-jade btn-sm" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                      {updateMutation.isError && (
                        <div className="w-100" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                          Could not save changes.
                        </div>
                      )}
                    </form>
                  ) : confirmingId === t.id ? (
                    <div className="d-flex align-items-center gap-3 flex-wrap w-100">
                      <span style={{ fontWeight: 500, fontSize: 13.5 }}>Delete this transaction?</span>
                      <span className="text-faint" style={{ fontSize: 12.5 }}>
                        This cannot be undone.
                      </span>
                      <div className="d-flex gap-2 ms-auto">
                        <button
                          className="btn btn-red btn-sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(t.id)}
                        >
                          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={cancelDelete}>
                          Cancel
                        </button>
                      </div>
                      {deleteMutation.isError && (
                        <div className="w-100" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                          Could not delete this transaction.
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="txn-icon" style={{ color }}>
                        <i className={`bi ${icon}`} />
                      </div>
                      <div className="txn-main">
                        <div className="txn-desc">{t.description}</div>
                        <div className="txn-meta">
                          <span>{catName || 'Uncategorized'}</span>
                          <span className="dot-sep" />
                          <span>{accountById[t.account?.id]?.name || 'Account'}</span>
                        </div>
                      </div>
                      <div className="txn-right">
                        <div className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                          {money(Number(t.amount), { signed: true })}
                        </div>
                        <div className="txn-balance">{money(Number(t.runningBalance))}</div>
                      </div>
                      <div className="d-flex gap-1 ms-2">
                        <button className="icon-btn" title="Edit transaction" onClick={() => startEdit(t)}>
                          <i className="bi bi-pencil" />
                        </button>
                        <button className="icon-btn" title="Delete transaction" onClick={() => setConfirmingId(t.id)}>
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
