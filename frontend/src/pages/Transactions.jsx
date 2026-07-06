import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi, CategoriesApi, TransactionsApi } from '../api/ledger';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseSignedAmount(raw) {
  const trimmed = raw.trim();
  const value = Math.abs(Number(trimmed.startsWith('+') ? trimmed.slice(1) : trimmed));
  return trimmed.startsWith('+') ? value : -value;
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

function dayLabel(dateStr) {
  const date = new Date(dateStr);
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

  const txnQueries = useQueries({
    queries: accounts.map((a) => ({
      queryKey: ['transactions', a.id],
      queryFn: () => TransactionsApi.listByAccount(a.id),
      enabled: !!a.id,
    })),
  });

  const accountById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  const grouped = useMemo(() => {
    const flat = txnQueries
      .flatMap((q) => q.data || [])
      .filter((t) => t.description.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.occurredOn) - new Date(a.occurredOn));

    const map = new Map();
    for (const t of flat) {
      const label = dayLabel(t.occurredOn);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }
    return Array.from(map.entries());
  }, [txnQueries, search]);

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
            <select className="form-select form-select-sm">
              <option>All accounts</option>
              {accounts.map((a) => (
                <option key={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select form-select-sm">
              <option>All categories</option>
              {Object.keys(categoryColors).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select form-select-sm">
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>This year</option>
            </select>
          </div>
          <div className="col-md-2 text-md-end">
            <button className="btn btn-ghost btn-sm w-100 w-md-auto">
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
        const total = items.reduce((s, t) => s + Number(t.amount), 0);
        return (
          <div key={label} className="mb-1">
            <div className="day-heading">
              <div className="eyebrow">{label}</div>
              <div className="day-total">{money(total, { signed: true })}</div>
            </div>
            {items.map((t) => {
              const catName = t.category?.name;
              const icon = categoryIcons[catName] || 'bi-dot';
              const color = categoryColors[catName] || '#8B92A0';
              return (
                <div className="txn-row" key={t.id}>
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
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
