import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi, CategoriesApi, TransactionsApi } from '../api/ledger';
import { iconClassName } from '../constants/categoryIcons';
import { parseLocalDate, startOfDay } from '../utils/date';
import { balanceAsOf, sortChronologically } from '../utils/balance';
import { useStickyHeader } from '../hooks/useStickyHeader';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseSignedAmount(raw) {
  const trimmed = raw.trim();
  const isPositive = trimmed.startsWith('+');
  const stripped = isPositive ? trimmed.slice(1) : trimmed;

  const lastSep = Math.max(stripped.lastIndexOf('.'), stripped.lastIndexOf(','));
  let normalized;
  if (lastSep !== -1) {
    const afterSep = stripped.length - lastSep - 1;
    if (afterSep >= 1 && afterSep <= 2) {
      // Last separator is the decimal point
      const intPart = stripped.slice(0, lastSep).replace(/[.,]/g, '');
      normalized = `${intPart || '0'}.${stripped.slice(lastSep + 1)}`;
    } else {
      // All separators are thousands separators
      normalized = stripped.replace(/[.,]/g, '');
    }
  } else {
    normalized = stripped;
  }

  const value = Math.abs(Number(normalized));
  return isPositive ? value : -value;
}

// Inverse of parseSignedAmount — round-trips a stored amount back into the
// same "+income / -expense" text format the input expects.
function formatSignedAmount(amount) {
  const num = Number(amount);
  return num >= 0 ? `+${num}` : `${num}`;
}

// DRY RUN — hardcoded, not wired to category creation yet. Covers common
// household categories so we can eyeball icon coverage before building a
// real icon picker. See CLAUDE.md discussion: bootstrap-icons has no
// dedicated Pets or Kids glyph — those two fall back to a generic pick.
const categoryColors = {
  Groceries: '#4FA98A',
  Housing: '#C9A227',
  Transport: '#6B8FC9',
  Income: '#4FA98A',
  Dining: '#C9A227',
  Subscriptions: '#8B92A0',
  Transfer: '#8B92A0',
  Salary: '#4FA98A',
  Gasoline: '#6B8FC9',
  Kids: '#C9A227',
  Fun: '#C9A227',
  Entertainment: '#C9A227',
  Pets: '#6B8FC9',
  Trips: '#4FA98A',
  Travel: '#4FA98A',
  Utilities: '#8B92A0',
  Health: '#C75450',
  Medical: '#C75450',
  Insurance: '#8B92A0',
  Shopping: '#C9A227',
  Gifts: '#C75450',
  Education: '#6B8FC9',
  Fitness: '#4FA98A',
  Gym: '#4FA98A',
  Phone: '#8B92A0',
  Internet: '#8B92A0',
  Savings: '#4FA98A',
  Investments: '#4FA98A',
  Charity: '#C75450',
  Donations: '#C75450',
  Clothing: '#C9A227',
  Electronics: '#6B8FC9',
  'Personal care': '#C9A227',
  Taxes: '#8B92A0',
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
  Gasoline: 'bi-fuel-pump',
  Kids: 'bi-balloon', // gap — no dedicated child/kid icon in bootstrap-icons
  Fun: 'bi-controller',
  Entertainment: 'bi-film',
  Pets: 'bi-heart', // gap — no dog/cat/paw icon in bootstrap-icons
  Trips: 'bi-airplane',
  Travel: 'bi-airplane',
  Utilities: 'bi-lightning-charge',
  Health: 'bi-heart-pulse',
  Medical: 'bi-heart-pulse',
  Insurance: 'bi-shield-check',
  Shopping: 'bi-bag',
  Gifts: 'bi-gift',
  Education: 'bi-mortarboard',
  Fitness: 'bi-activity', // no dumbbell icon in bootstrap-icons
  Gym: 'bi-activity',
  Phone: 'bi-phone',
  Internet: 'bi-wifi',
  Savings: 'bi-piggy-bank',
  Investments: 'bi-graph-up-arrow',
  Charity: 'bi-heart-fill',
  Donations: 'bi-heart-fill',
  Clothing: 'bi-bag-plus', // no shirt icon in bootstrap-icons
  Electronics: 'bi-laptop',
  'Personal care': 'bi-droplet',
  Taxes: 'bi-file-earmark-text',
};

function money(amount, { signed = false } = {}) {
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : signed ? '+' : '';
  return `${sign}$${value}`;
}

function monthBounds(monthOffset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  return { start, end };
}

// Custom range with a blank start/end means "unbounded" in that direction —
// used to show a full account history when drilling in from elsewhere.
function rangeBounds(range, customStart, customEnd, monthOffset) {
  if (range === 'custom') {
    return {
      start: customStart ? parseLocalDate(customStart) : null,
      end: customEnd ? parseLocalDate(customEnd) : null,
    };
  }
  return monthBounds(monthOffset);
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

function dayLabelKind(dateStr) {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'today';
  if (date > today) return 'future';
  return 'past';
}

// Two-value stat card body (Monthly totals, Predicted): value on top in the
// same size as a single-value card's figure, label below — mirrors the
// caption-below-the-number pattern used by Current balance / Filtered total.
function StatPair({ items }) {
  return (
    <div className="stat-pair">
      {items.map((item) => (
        <div key={item.label} className="stat-pair-item">
          <div className="mono stat-figure" style={{ color: item.color }}>
            {item.value}
          </div>
          <div className="stat-pair-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function Transactions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const addFormRef = useRef(null);
  const transferFormRef = useRef(null);
  const stickyHeaderRef = useRef(null);
  const { sentinelRef, progress, isStuck } = useStickyHeader();

  const scrollFormIntoView = (formRef) => {
    if (!formRef.current) return;
    const headerHeight = stickyHeaderRef.current?.getBoundingClientRect().height || 0;
    const top = formRef.current.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
    window.scrollTo({ top, behavior: 'smooth' });
    formRef.current.querySelector('select, input, textarea')?.focus({ preventScroll: true });
  };

  useEffect(() => {
    function onClickOutside(e) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const [filterAccountId, setFilterAccountId] = useState(() => {
    try {
      return localStorage.getItem('ledger:lastAccountId') || '';
    } catch {
      return '';
    }
  });
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterRange, setFilterRange] = useState('this-month');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [monthOffset, setMonthOffset] = useState(0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Arriving via a "View transactions" link with ?account=<id> jumps
  // straight to that account's full list — an unbounded custom range shows
  // the complete history. URL param also updates the remembered account.
  useEffect(() => {
    const accountParam = searchParams.get('account');
    if (accountParam) {
      setFilterAccountId(accountParam);
      setFilterCategoryId('');
      setSearch('');
      setFilterRange('custom');
      setFilterStartDate('');
      setFilterEndDate('');
      setMonthOffset(0);
      try {
        localStorage.setItem('ledger:lastAccountId', accountParam);
      } catch {
        // ignore storage errors
      }
    }
  }, [searchParams]);

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  // Credit cards are handled entirely on the dedicated Card Bills page.
  const accounts = useMemo(
    () =>
      (accountsQuery.data || [])
        .filter((a) => a.kind !== 'CREDIT_CARD')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [accountsQuery.data]
  );
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = useMemo(
    () => [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data]
  );

  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (showForm) scrollFormIntoView(addFormRef);
  }, [showForm]);

  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [repeat, setRepeat] = useState('NONE');
  const [occurrences, setOccurrences] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setAccountId('');
    setCategoryId('');
    setDescription('');
    setAmount('');
    setOccurredOn(todayIso());
    setRepeat('NONE');
    setOccurrences('');
  };

  const createMutation = useMutation({
    mutationFn: TransactionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      resetForm();
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
      repeat: repeat !== 'NONE' ? repeat : null,
      occurrences: repeat !== 'NONE' ? Number(occurrences) : null,
    });
  };

  const [showTransferForm, setShowTransferForm] = useState(false);

  useEffect(() => {
    if (showTransferForm) scrollFormIntoView(transferFormRef);
  }, [showTransferForm]);

  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferDescription, setTransferDescription] = useState('Transfer');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferOccurredOn, setTransferOccurredOn] = useState(todayIso());

  const resetTransferForm = () => {
    setShowTransferForm(false);
    setTransferSourceId('');
    setTransferTargetId('');
    setTransferDescription('Transfer');
    setTransferAmount('');
    setTransferOccurredOn(todayIso());
  };

  const createTransferMutation = useMutation({
    mutationFn: TransactionsApi.createTransfer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      resetTransferForm();
    },
  });

  const handleTransferSubmit = (e) => {
    e.preventDefault();
    createTransferMutation.mutate({
      sourceAccountId: Number(transferSourceId),
      targetAccountId: Number(transferTargetId),
      description: transferDescription,
      amount: Math.abs(parseSignedAmount(transferAmount)),
      occurredOn: transferOccurredOn,
    });
  };

  const [editingId, setEditingId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editOccurredOn, setEditOccurredOn] = useState('');
  const [editScope, setEditScope] = useState('THIS');

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => TransactionsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setEditingId(null);
    },
  });

  const startClone = (t) => {
    setEditingId(null);
    setConfirmingId(null);
    setAccountId(String(t.account?.id || ''));
    setCategoryId(t.category?.id ? String(t.category.id) : '');
    setDescription(t.description);
    setAmount(formatSignedAmount(t.amount));
    setOccurredOn(t.occurredOn);
    setRepeat('NONE');
    setOccurrences('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEdit = (t) => {
    setConfirmingId(null);
    setEditingId(t.id);
    setEditCategoryId(t.category?.id ? String(t.category.id) : '');
    setEditDescription(t.description);
    setEditAmount(t.transferPeer ? String(Math.abs(Number(t.amount))) : formatSignedAmount(t.amount));
    setEditOccurredOn(t.occurredOn);
    setEditScope('THIS');
  };

  const handleEditSubmit = (e, t) => {
    e.preventDefault();
    const isTransfer = !!t.transferPeer;
    updateMutation.mutate({
      id: t.id,
      payload: {
        categoryId: isTransfer ? null : (editCategoryId ? Number(editCategoryId) : null),
        description: editDescription,
        // Transfer edits always send a positive magnitude — the backend re-derives each side's sign.
        amount: isTransfer ? Math.abs(parseSignedAmount(editAmount)) : parseSignedAmount(editAmount),
        occurredOn: editOccurredOn,
        scope: !isTransfer && t.seriesId ? editScope : undefined,
      },
    });
  };

  const [confirmingId, setConfirmingId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: ({ id, scope }) => TransactionsApi.remove(id, scope),
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

  // A remembered/linked account id from before credit cards were filtered
  // out of this page (or a stale URL param) won't resolve anymore — fall
  // back to "All accounts" instead of silently showing an empty list.
  useEffect(() => {
    if (filterAccountId && accountsQuery.data && !accountById[filterAccountId]) {
      setFilterAccountId('');
      try {
        localStorage.removeItem('ledger:lastAccountId');
      } catch {
        // ignore storage errors
      }
    }
  }, [accountsQuery.data, filterAccountId, accountById]);

  // Chronologically sorted per-account transactions (unfiltered by search/category),
  // used to look up "balance as of a given day" regardless of which rows are
  // currently visible under the active filters.
  const sortedTxnsByAccount = useMemo(() => {
    const map = new Map();
    accounts.forEach((a, i) => {
      map.set(a.id, sortChronologically(txnQueries[i]?.data || []));
    });
    return map;
  }, [accounts, txnQueries]);

  function accountBalanceAsOf(account, cutoffDate) {
    return balanceAsOf(account, sortedTxnsByAccount.get(account.id) || [], cutoffDate);
  }

  // "All accounts" balance totals only ever mean checking/savings — credit
  // cards are handled entirely on the Card Bills page. Viewing one specific
  // account directly is unaffected — that still shows that one account's
  // own balance.
  const liquidAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'CHECKING' || a.kind === 'SAVINGS'),
    [accounts]
  );

  function balanceAsOfDay(cutoffDate) {
    const relevantAccounts = filterAccountId
      ? accounts.filter((a) => String(a.id) === filterAccountId)
      : liquidAccounts;
    return relevantAccounts.reduce((sum, a) => sum + accountBalanceAsOf(a, cutoffDate), 0);
  }

  const now = new Date();
  const today = startOfDay(now);
  const currentBalanceTotal = filterAccountId
    ? (accountById[filterAccountId] ? accountBalanceAsOf(accountById[filterAccountId], today) : 0)
    : liquidAccounts.reduce((sum, a) => sum + accountBalanceAsOf(a, today), 0);
  const isOwing = currentBalanceTotal < 0;

  // Predicted end-of-month balances for the selected month plus the next
  // one — always relative to monthOffset, not today's real date. Only
  // meaningful in "this-month" mode; custom ranges have no single selected
  // month to walk forward from.
  const predictedMonths = filterRange === 'this-month'
    ? [0, 1].map((i) => {
        const { start, end } = monthBounds(monthOffset + i);
        const balance = filterAccountId
          ? (accountById[filterAccountId] ? accountBalanceAsOf(accountById[filterAccountId], end) : 0)
          : liquidAccounts.reduce((sum, a) => sum + accountBalanceAsOf(a, end), 0);
        return { label: start.toLocaleDateString('en-US', { month: 'long' }), balance };
      })
    : [];
  const showPredicted = predictedMonths.length > 0;
  const hasActiveFilter = Boolean(filterCategoryId || search.trim());
  const showMonthlyTotals = filterRange === 'this-month';

  const visibleCardCount =
    1 + (showMonthlyTotals ? 1 : 0) + (showPredicted ? 1 : 0) + (hasActiveFilter ? 1 : 0);
  const topCardClass =
    visibleCardCount === 4 ? 'col-md-3' :
    visibleCardCount === 3 ? 'col-md-4' :
    visibleCardCount === 2 ? 'col-md-6' :
    'col-md-12';

  const filteredCategoryName = categories.find((c) => String(c.id) === filterCategoryId)?.name;

  const filteredFlat = useMemo(() => {
    const { start, end } = rangeBounds(filterRange, filterStartDate, filterEndDate, monthOffset);
    return txnQueries
      .flatMap((q) => q.data || [])
      .filter((t) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;
        return (
          t.description.toLowerCase().includes(term) ||
          (t.category?.name || '').toLowerCase().includes(term) ||
          String(t.amount).toLowerCase().includes(term)
        );
      })
      .filter((t) => !filterAccountId || String(t.account?.id) === filterAccountId)
      .filter((t) => !filterCategoryId || String(t.category?.id) === filterCategoryId)
      .filter((t) => !start || parseLocalDate(t.occurredOn) >= start)
      .filter((t) => !end || parseLocalDate(t.occurredOn) <= end)
      .sort((a, b) => {
        const dateDiff = parseLocalDate(b.occurredOn) - parseLocalDate(a.occurredOn);
        if (dateDiff !== 0) return dateDiff;
        return b.id - a.id;
      });
  }, [txnQueries, search, filterAccountId, filterCategoryId, filterRange, filterStartDate, filterEndDate, monthOffset]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of filteredFlat) {
      const label = dayLabel(t.occurredOn);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }
    return Array.from(map.entries());
  }, [filteredFlat]);

  const filteredTotal = filteredFlat.reduce((sum, t) => sum + Number(t.amount), 0);

  const monthlyFlat = useMemo(() => {
    const { start, end } = rangeBounds(filterRange, filterStartDate, filterEndDate, monthOffset);
    return txnQueries
      .flatMap((q) => q.data || [])
      .filter((t) => !filterAccountId || String(t.account?.id) === filterAccountId)
      .filter((t) => !start || parseLocalDate(t.occurredOn) >= start)
      .filter((t) => !end || parseLocalDate(t.occurredOn) <= end)
      .sort((a, b) => {
        const dateDiff = parseLocalDate(b.occurredOn) - parseLocalDate(a.occurredOn);
        if (dateDiff !== 0) return dateDiff;
        return b.id - a.id;
      });
  }, [txnQueries, filterAccountId, filterRange, filterStartDate, filterEndDate, monthOffset]);

  const monthlyCredits = monthlyFlat.reduce(
    (sum, t) => sum + (Number(t.amount) > 0 ? Number(t.amount) : 0),
    0
  );
  const monthlyDebits = monthlyFlat.reduce(
    (sum, t) => sum + (Number(t.amount) < 0 ? Number(t.amount) : 0),
    0
  );

  const handleExport = () => {
    downloadCsv(toCsv(filteredFlat), `transactions-${todayIso()}.csv`);
  };

  const isLoading = accountsQuery.isLoading || txnQueries.some((q) => q.isLoading);

  return (
    <div>
      <div ref={sentinelRef} />
      <div
        ref={stickyHeaderRef}
        className={`sticky-page-header${isStuck ? ' is-stuck' : ''}`}
        style={{ '--header-scale': progress }}
      >
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">All accounts</div>
          <div className="page-title">Transactions</div>
        </div>
        <div className="dropdown-custom d-flex align-items-center" ref={addMenuRef}>
          <button
            className="btn btn-jade btn-sm"
            onClick={() => {
              if (!showForm && filterAccountId) setAccountId(filterAccountId);
              setShowTransferForm(false);
              setShowForm((s) => !s);
            }}
          >
            <i className="bi bi-plus-lg me-1" />
            Add transaction
          </button>
          <button
            type="button"
            className="btn btn-jade btn-sm px-2 ms-1"
            title="More ways to add"
            onClick={() => setShowAddMenu((s) => !s)}
          >
            <i className="bi bi-chevron-down" />
          </button>
          {showAddMenu && (
            <div className="dropdown-menu-custom">
              <button
                type="button"
                className="dropdown-item-custom"
                onClick={() => { setShowAddMenu(false); navigate('/card-bills?add=1'); }}
              >
                <i className="bi bi-credit-card me-2" />
                Add credit card transaction
              </button>
              <button
                type="button"
                className="dropdown-item-custom"
                onClick={() => { setShowAddMenu(false); setShowForm(false); setShowTransferForm(true); }}
              >
                <i className="bi bi-arrow-left-right me-2" />
                Add transfer transaction
              </button>
              <button
                type="button"
                className="dropdown-item-custom"
                onClick={() => { setShowAddMenu(false); navigate('/transactions/import'); }}
              >
                <i className="bi bi-file-earmark-arrow-up me-2" />
                Import from CSV/PDF
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="nav-toolbar">
        <select
          className="form-select form-select-lg"
          style={{ width: 'auto', minWidth: 220 }}
          value={filterAccountId}
          onChange={(e) => {
            const next = e.target.value;
            setFilterAccountId(next);
            try {
              if (next) {
                localStorage.setItem('ledger:lastAccountId', next);
              } else {
                localStorage.removeItem('ledger:lastAccountId');
              }
            } catch {
              // ignore storage errors
            }
          }}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        {(() => {
          const monthLabel = monthBounds(monthOffset).start.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          });
          const rangeSelect = (
            <select
              className="form-select form-select-lg"
              style={{ width: 'auto', minWidth: 180 }}
              value={filterRange}
              onChange={(e) => {
                const next = e.target.value;
                setFilterRange(next);
                if (next === 'this-month') {
                  setMonthOffset(0);
                }
              }}
            >
              <option value="this-month">{monthLabel}</option>
              <option value="custom">Custom range</option>
            </select>
          );

          if (filterRange === 'this-month') {
            return (
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="icon-btn icon-btn-lg"
                  title="Previous month"
                  onClick={() => setMonthOffset((o) => o - 1)}
                >
                  <i className="bi bi-chevron-left" />
                </button>
                {rangeSelect}
                <button
                  type="button"
                  className="icon-btn icon-btn-lg"
                  title="Next month"
                  onClick={() => setMonthOffset((o) => o + 1)}
                >
                  <i className="bi bi-chevron-right" />
                </button>
              </div>
            );
          }

          return (
            <div className="d-flex align-items-center gap-2">
              {rangeSelect}
              <input
                type="date"
                className="form-control form-control-sm"
                style={{ width: 'auto' }}
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
              />
              <span className="text-faint">to</span>
              <input
                type="date"
                className="form-control form-control-sm"
                style={{ width: 'auto' }}
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
              />
            </div>
          );
        })()}
      </div>
      </div>

      <div className="panel p-4 mb-4">
        <div className="row g-3">
          <div className={topCardClass}>
            <div className="eyebrow mb-2 d-flex align-items-center gap-2">
              <span>
                Current balance
                {filterAccountId ? ` — ${accountById[filterAccountId]?.name}` : ''}
              </span>
            </div>
            <div className="hero-balance md" style={{ color: isOwing ? 'var(--red)' : undefined }}>
              {money(currentBalanceTotal)}
            </div>
            {(filterCategoryId || search) && (
              <div className="text-faint mt-1" style={{ fontSize: 11.5 }}>
                Your real balance — not limited to the category/search filter below.
              </div>
            )}
          </div>
          {showMonthlyTotals && (
            <div className={topCardClass}>
              <div className="eyebrow mb-2">Monthly totals</div>
              <StatPair
                items={[
                  { label: 'Credits', value: money(monthlyCredits, { signed: true }), color: 'var(--jade)' },
                  { label: 'Debits', value: money(monthlyDebits, { signed: true }), color: 'var(--red)' },
                ]}
              />
            </div>
          )}
          {showPredicted && (
            <div className={topCardClass}>
              <div className="eyebrow mb-2">Predicted</div>
              <StatPair
                items={predictedMonths.map((m) => ({
                  label: m.label,
                  value: money(m.balance),
                  color: m.balance < 0 ? 'var(--red)' : undefined,
                }))}
              />
            </div>
          )}
          {hasActiveFilter && (
            <div className={topCardClass}>
              <div className="eyebrow mb-2">
                {filterCategoryId ? `${filteredCategoryName} total` : 'Filtered total'}
              </div>
              <div
                className="mono stat-figure"
                style={{ color: filteredTotal < 0 ? 'var(--red)' : 'var(--jade)' }}
              >
                {money(filteredTotal, { signed: true })}
              </div>
              <div className="text-faint mt-1" style={{ fontSize: 11.5 }}>
                Sum of currently filtered transactions.
              </div>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="panel p-4 mb-4" ref={addFormRef}>
          <form onSubmit={handleSubmit}>
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
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
              <div className="col-md-3">
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
              <div className="col-md-3">
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
            </div>
            <div className="row g-3 align-items-end mt-1">
              <div className={repeat === 'NONE' ? 'col-md-6' : 'col-md-4'}>
                <label className="eyebrow d-block mb-2">Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  required
                />
              </div>
              <div className={repeat === 'NONE' ? 'col-md-6' : 'col-md-4'}>
                <label className="eyebrow d-block mb-2">Repeat</label>
                <select
                  className="form-select form-select-sm"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                >
                  <option value="NONE">Doesn&rsquo;t repeat</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="INSTALLMENTS">Installments</option>
                </select>
              </div>
              {repeat !== 'NONE' && (
                <div className="col-md-4">
                  <label className="eyebrow d-block mb-2">
                    {repeat === 'INSTALLMENTS' ? 'Installments' : 'Occurrences'}
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    className="form-control form-control-sm"
                    value={occurrences}
                    onChange={(e) => setOccurrences(e.target.value)}
                    required
                  />
                </div>
              )}
              {repeat !== 'NONE' && (
                <div className="col-12 text-faint" style={{ fontSize: 11.5 }}>
                  {repeat === 'INSTALLMENTS'
                    ? `Splits the amount evenly into ${occurrences || 'N'} monthly transactions.`
                    : `Creates ${occurrences || 'N'} ${repeat.toLowerCase()} transactions of the same amount, starting on the date above.`}
                </div>
              )}
            </div>
            <div className="row mt-3">
              <div className="col-12 d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-jade btn-sm" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {showTransferForm && (
        <div className="panel p-4 mb-4" ref={transferFormRef}>
          <form onSubmit={handleTransferSubmit}>
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">From account</label>
                <select
                  className="form-select form-select-sm"
                  value={transferSourceId}
                  onChange={(e) => setTransferSourceId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={String(a.id) === transferTargetId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">To account</label>
                <select
                  className="form-select form-select-sm"
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={String(a.id) === transferSourceId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Description</label>
                <input
                  className="form-control form-control-sm"
                  value={transferDescription}
                  onChange={(e) => setTransferDescription(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-3">
                <label className="eyebrow d-block mb-2">Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="form-control form-control-sm"
                  placeholder="12.50"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="row g-3 align-items-end mt-1">
              <div className="col-md-6">
                <label className="eyebrow d-block mb-2">Date</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={transferOccurredOn}
                  onChange={(e) => setTransferOccurredOn(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="row mt-3">
              <div className="col-12 d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetTransferForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-jade btn-sm" disabled={createTransferMutation.isPending}>
                  {createTransferMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </div>
            {createTransferMutation.isError && (
              <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                Could not create transfer.
              </div>
            )}
          </form>
        </div>
      )}

      <div className="d-flex align-items-center justify-content-between mb-3">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowMoreFilters((s) => !s)}
        >
          <i className={`bi ${showMoreFilters ? 'bi-chevron-up' : 'bi-chevron-down'} me-1`} />
          {showMoreFilters ? 'Hide filters' : 'More filters'}
          {!showMoreFilters && (search || filterCategoryId) && <span className="tag ms-2">Active</span>}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>
          <i className="bi bi-download me-1" />
          Export
        </button>
      </div>

      {showMoreFilters && (
        <div className="panel p-3 mb-3">
          <div className="row g-2 align-items-center">
            <div className="col-md-6">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search description, category, or amount"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-md-6">
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
          </div>
        </div>
      )}

      {isLoading && <div className="text-muted-c">Loading…</div>}

      {!isLoading && grouped.length === 0 && (
        <div className="panel p-4 text-muted-c" style={{ fontSize: 13 }}>
          No transactions yet.
        </div>
      )}

      {grouped.map(([label, items]) => {
        const dayBalance = balanceAsOfDay(parseLocalDate(items[0].occurredOn));
        const dayOwing = dayBalance < 0;
        const kind = dayLabelKind(items[0].occurredOn);
        return (
          <div key={label} className="mb-1">
            <div className={`day-heading ${kind}`}>
              <div className="eyebrow">{label}</div>
              <div className="day-total" style={{ color: dayOwing ? 'var(--red)' : undefined }}>
                {money(dayBalance)}
              </div>
            </div>
            {items.map((t) => {
              const isTransfer = !!t.transferPeer;
              const catName = t.linkedCard ? 'Card payment' : isTransfer ? 'Transfer' : t.category?.name;
              const icon = t.linkedCard
                ? 'bi-credit-card'
                : isTransfer
                ? 'bi-arrow-left-right'
                : (t.category?.icon || categoryIcons[catName] || 'bi-dot');
              const color = t.category?.colorHex || categoryColors[catName] || '#8B92A0';
              const rowKind = dayLabelKind(t.occurredOn);
              // Same direction label regardless of which side of the transfer this row is —
              // negative amount means this row is the leaving/source side.
              const transferDirectionLabel = isTransfer
                ? Number(t.amount) < 0
                  ? `${accountById[t.account?.id]?.name || 'Account'} → ${accountById[t.transferPeer.account?.id]?.name || t.transferPeer.account?.name || 'Account'}`
                  : `${accountById[t.transferPeer.account?.id]?.name || t.transferPeer.account?.name || 'Account'} → ${accountById[t.account?.id]?.name || 'Account'}`
                : null;
              return (
                <div
                  className={`txn-row ${rowKind}`}
                  style={t.linkedCard ? { borderStyle: 'dashed' } : undefined}
                  key={t.id}
                >
                  {editingId === t.id ? (
                    <form
                      onSubmit={(e) => handleEditSubmit(e, t)}
                      className="d-flex align-items-center gap-2 flex-wrap w-100"
                    >
                      {!isTransfer && (
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
                      )}
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
                      {t.seriesId && (
                        <div className="d-flex gap-3 w-100" style={{ fontSize: 12 }}>
                          <label className="d-flex align-items-center gap-1">
                            <input
                              type="radio"
                              name={`edit-scope-${t.id}`}
                              checked={editScope === 'THIS'}
                              onChange={() => setEditScope('THIS')}
                            />
                            This occurrence only
                          </label>
                          <label className="d-flex align-items-center gap-1">
                            <input
                              type="radio"
                              name={`edit-scope-${t.id}`}
                              checked={editScope === 'FUTURE'}
                              onChange={() => setEditScope('FUTURE')}
                            />
                            This and future
                          </label>
                        </div>
                      )}
                      {t.seriesId && editScope === 'FUTURE' && t.seriesRepeat === 'INSTALLMENTS' && (
                        <div className="w-100 text-faint" style={{ fontSize: 11.5 }}>
                          Amount is re-split evenly across this and the remaining installments.
                        </div>
                      )}
                      {updateMutation.isError && (
                        <div className="w-100" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                          Could not save changes.
                        </div>
                      )}
                    </form>
                  ) : confirmingId === t.id ? (
                    <div className="d-flex align-items-center gap-3 flex-wrap w-100">
                      <span style={{ fontWeight: 500, fontSize: 13.5 }}>
                        {isTransfer ? 'Delete this transfer?' : 'Delete this transaction?'}
                      </span>
                      <span className="text-faint" style={{ fontSize: 12.5 }}>
                        {isTransfer ? 'Removes both sides of the transfer. This cannot be undone.' : 'This cannot be undone.'}
                      </span>
                      <div className="d-flex gap-2 ms-auto">
                        {t.seriesId ? (
                          <>
                            <button
                              className="btn btn-red btn-sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate({ id: t.id, scope: 'THIS' })}
                            >
                              Delete this only
                            </button>
                            <button
                              className="btn btn-red btn-sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate({ id: t.id, scope: 'FUTURE' })}
                            >
                              Delete this & future
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-red btn-sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate({ id: t.id, scope: 'THIS' })}
                          >
                            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
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
                    <div className="txn-body">
                      <div className="txn-icon" style={{ color }}>
                        <i className={iconClassName(icon)} />
                      </div>
                      <div className="txn-main">
                        <div className="txn-desc">
                          <span className="txn-desc-text">{t.description}</span>
                          {rowKind === 'future' && (
                            <span className="tag" style={{ color: 'var(--jade)', borderColor: 'var(--jade)' }}>
                              Upcoming
                            </span>
                          )}
                          {t.seriesInfo && (
                            <span className="tag">
                              {t.seriesInfo}
                            </span>
                          )}
                          {t.linkedCard && (
                            <span className="tag">
                              Card bill
                            </span>
                          )}
                        </div>
                        <div className="txn-meta">
                          <span className="txn-meta-cat">{catName || 'Uncategorized'}</span>
                          <span className="dot-sep" />
                          <span className="txn-meta-value">{isTransfer ? transferDirectionLabel : (accountById[t.account?.id]?.name || 'Account')}</span>
                        </div>
                      </div>
                      <div className="txn-right">
                        <div className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                          {money(Number(t.amount), { signed: true })}
                        </div>
                        <div className="txn-balance">
                          {money(Number(t.runningBalance))}
                        </div>
                      </div>
                      <div className="txn-actions">
                        {t.linkedCard ? (
                          <Link
                            to={`/card-bills?account=${t.linkedCard.id}&bill=${t.occurredOn}`}
                            className="btn btn-ghost btn-sm"
                          >
                            View bill
                          </Link>
                        ) : (
                          <>
                            <button className="icon-btn" title="Edit transaction" onClick={() => startEdit(t)}>
                              <i className="bi bi-pencil" />
                            </button>
                            {!isTransfer && (
                              <button className="icon-btn" title="Clone transaction" onClick={() => startClone(t)}>
                                <i className="bi bi-copy" />
                              </button>
                            )}
                            <button className="icon-btn" title="Delete transaction" onClick={() => setConfirmingId(t.id)}>
                              <i className="bi bi-trash" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
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
