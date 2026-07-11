import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountsApi, CategoriesApi, TransactionsApi } from '../api/ledger';
import { parseLocalDate, startOfDay, isoDate } from '../utils/date';
import { iconClassName } from '../constants/categoryIcons';
import {
  billDueDateFor,
  nextBillFor,
  groupTransactionsByBill,
  billOptionsFor,
  billOptionsWithCurrent,
} from '../utils/creditCard';

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
      const intPart = stripped.slice(0, lastSep).replace(/[.,]/g, '');
      normalized = `${intPart || '0'}.${stripped.slice(lastSep + 1)}`;
    } else {
      normalized = stripped.replace(/[.,]/g, '');
    }
  } else {
    normalized = stripped;
  }

  const value = Math.abs(Number(normalized));
  return isPositive ? value : -value;
}

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

function dueDateLine(dueDate, today) {
  const diffDays = Math.round((startOfDay(dueDate) - startOfDay(today)) / 86400000);
  const full = dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  if (diffDays === 0) return `${full} · due today`;
  if (diffDays === 1) return `${full} · due tomorrow`;
  if (diffDays > 1) return `${full} · in ${diffDays} days`;
  if (diffDays === -1) return `${full} · yesterday`;
  return `${full} · ${-diffDays} days ago`;
}

export default function CardBills() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);
  const allCards = useMemo(() => accounts.filter((a) => a.kind === 'CREDIT_CARD'), [accounts]);
  const eligibleCards = useMemo(() => allCards.filter((c) => c.dueDayOfMonth != null), [allCards]);

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = useMemo(
    () => [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [categoriesQuery.data]
  );

  const [selectedCardId, setSelectedCardId] = useState(() => {
    try {
      return searchParams.get('account') || localStorage.getItem('ledger:lastCardId') || '';
    } catch {
      return searchParams.get('account') || '';
    }
  });

  useEffect(() => {
    const accountParam = searchParams.get('account');
    if (accountParam) setSelectedCardId(accountParam);
  }, [searchParams]);

  // Default to the first eligible card once the account list loads, and
  // fall back if the remembered/URL card id isn't a valid credit card.
  useEffect(() => {
    if (!eligibleCards.length) return;
    if (!eligibleCards.some((c) => String(c.id) === selectedCardId)) {
      setSelectedCardId(String(eligibleCards[0].id));
    }
  }, [eligibleCards, selectedCardId]);

  const selectedCard = eligibleCards.find((c) => String(c.id) === selectedCardId);

  useEffect(() => {
    try {
      if (selectedCard) localStorage.setItem('ledger:lastCardId', String(selectedCard.id));
    } catch {
      // ignore storage errors
    }
  }, [selectedCard]);

  const transactionsQuery = useQuery({
    queryKey: ['transactions', selectedCard?.id],
    queryFn: () => TransactionsApi.listByAccount(selectedCard.id),
    enabled: !!selectedCard,
  });

  const sortedTxns = useMemo(() => {
    const raw = transactionsQuery.data || [];
    return [...raw].sort((x, y) => {
      const diff = parseLocalDate(x.occurredOn) - parseLocalDate(y.occurredOn);
      return diff !== 0 ? diff : x.id - y.id;
    });
  }, [transactionsQuery.data]);

  const now = new Date();
  const today = startOfDay(now);

  const billGroups = useMemo(
    () => (selectedCard ? groupTransactionsByBill(selectedCard, sortedTxns) : []),
    [selectedCard, sortedTxns]
  );
  const nextBill = useMemo(
    () => (selectedCard ? nextBillFor(selectedCard, sortedTxns, today) : null),
    [selectedCard, sortedTxns, today]
  );
  // Every due date the card's history has ever used, plus the next upcoming
  // one even if nothing's been assigned to it yet — so it stays reachable to
  // add the first charge to it.
  const billDates = useMemo(() => {
    const set = new Set(billGroups.map((g) => isoDate(g.dueDate)));
    if (nextBill?.dueDate) set.add(isoDate(nextBill.dueDate));
    return Array.from(set).sort();
  }, [billGroups, nextBill]);
  const defaultBillDueDate = nextBill?.dueDate ? isoDate(nextBill.dueDate) : billDates[billDates.length - 1] || '';

  const [selectedBillDueDate, setSelectedBillDueDate] = useState('');
  // A "View bill" link (e.g. from a synced bill row in Transactions) passes
  // the specific due date it represents via ?bill= — t.occurredOn already
  // *is* that bill's due date, so no separate bill-id lookup is needed.
  //
  // Deliberately does NOT read `selectedBillDueDate` to decide whether to
  // (re)apply the URL's bill, and does NOT depend on it either — only on
  // billDates/defaultBillDueDate/searchParams. Under React.StrictMode, dev
  // mode invokes an effect twice back-to-back reusing the *same* stale
  // closure; a version of this that gated on "selectedBillDueDate already
  // equals billParam" read '' both times (the first invocation's setState
  // hadn't landed yet when the second ran), so it fell through to the
  // fallback branch and silently reset the bill back to the default one.
  // `setSelectedBillDueDate` is idempotent (React bails out when the value
  // is unchanged) so it's safe to call unconditionally here.
  const appliedBillParam = useRef(null);
  const userSteppedAway = useRef(false);
  useEffect(() => {
    const billParam = searchParams.get('bill');
    if (billParam !== appliedBillParam.current) {
      appliedBillParam.current = billParam;
      userSteppedAway.current = false;
    }
    if (!billDates.length) return;
    if (billParam && !userSteppedAway.current && billDates.includes(billParam)) {
      setSelectedBillDueDate(billParam);
      return;
    }
    if (!billDates.includes(selectedBillDueDate)) {
      setSelectedBillDueDate(defaultBillDueDate);
    }
  }, [billDates, defaultBillDueDate, selectedBillDueDate, searchParams]);

  function stepBill(direction) {
    if (!billDates.length) return;
    const idx = billDates.indexOf(selectedBillDueDate);
    const nextIdx = idx === -1 ? 0 : idx + (direction === 'prev' ? -1 : 1);
    if (nextIdx < 0 || nextIdx >= billDates.length) return;
    userSteppedAway.current = true;
    setSelectedBillDueDate(billDates[nextIdx]);
  }

  const amountOwed = useMemo(() => {
    const group = billGroups.find((g) => isoDate(g.dueDate) === selectedBillDueDate);
    return group ? -group.total : 0;
  }, [billGroups, selectedBillDueDate]);

  const billTransactions = useMemo(
    () =>
      selectedCard
        ? sortedTxns
            .filter((t) => isoDate(billDueDateFor(selectedCard, t)) === selectedBillDueDate)
            .sort((a, b) => parseLocalDate(b.occurredOn) - parseLocalDate(a.occurredOn) || b.id - a.id)
        : [],
    [selectedCard, sortedTxns, selectedBillDueDate]
  );

  const [search, setSearch] = useState('');

  const filteredBillTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return billTransactions;
    return billTransactions.filter(
      (t) =>
        t.description.toLowerCase().includes(term) ||
        (t.category?.name || '').toLowerCase().includes(term) ||
        String(t.amount).toLowerCase().includes(term)
    );
  }, [billTransactions, search]);

  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [repeat, setRepeat] = useState('NONE');
  const [occurrences, setOccurrences] = useState('');
  const [billDueDate, setBillDueDate] = useState('');

  const openForm = () => {
    if (!showForm) {
      setOccurredOn(todayIso());
      setBillDueDate(selectedBillDueDate);
    }
    setShowForm((s) => !s);
  };

  // Deep link from Transactions' "Add credit card transaction" menu item
  // (?add=1) — force the form open (not openForm's toggle) as soon as a
  // bill is actually selected, so billDueDate captures a real value instead
  // of the '' it starts as before the bill-selection effect above runs.
  const appliedAddParam = useRef(false);
  useEffect(() => {
    if (
      searchParams.get('add') === '1' &&
      selectedCard &&
      selectedBillDueDate &&
      !appliedAddParam.current
    ) {
      appliedAddParam.current = true;
      setOccurredOn(todayIso());
      setBillDueDate(selectedBillDueDate);
      setShowForm(true);
    }
  }, [searchParams, selectedCard, selectedBillDueDate]);

  const resetForm = () => {
    setShowForm(false);
    setCategoryId('');
    setDescription('');
    setAmount('');
    setOccurredOn(todayIso());
    setRepeat('NONE');
    setOccurrences('');
    setBillDueDate('');
  };

  const createMutation = useMutation({
    mutationFn: TransactionsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', selectedCard?.id] });
      resetForm();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Only persist billDueDate when it's a genuine override — i.e. it
    // differs from what would be computed naturally for this occurredOn.
    // Overview's "Credit card debt" total relies on this null-means-natural
    // convention to avoid excluding ordinary, untouched transactions.
    const naturalBill = billOptionsFor(selectedCard, occurredOn)[0];
    const isOverride = repeat === 'NONE' && billDueDate && (!naturalBill || billDueDate !== isoDate(naturalBill));
    createMutation.mutate({
      accountId: selectedCard.id,
      categoryId: categoryId ? Number(categoryId) : null,
      description,
      amount: parseSignedAmount(amount),
      occurredOn,
      repeat: repeat !== 'NONE' ? repeat : null,
      occurrences: repeat !== 'NONE' ? Number(occurrences) : null,
      billDueDate: isOverride ? billDueDate : null,
    });
  };

  const [editingId, setEditingId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editOccurredOn, setEditOccurredOn] = useState('');
  const [editBillDueDate, setEditBillDueDate] = useState('');

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => TransactionsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', selectedCard?.id] });
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
    setEditBillDueDate(t.billDueDate || (selectedCard ? isoDate(billDueDateFor(selectedCard, t)) : ''));
  };

  const handleEditSubmit = (e, id) => {
    e.preventDefault();
    const naturalBill = billOptionsFor(selectedCard, editOccurredOn)[0];
    const isOverride = editBillDueDate && (!naturalBill || editBillDueDate !== isoDate(naturalBill));
    updateMutation.mutate({
      id,
      payload: {
        categoryId: editCategoryId ? Number(editCategoryId) : null,
        description: editDescription,
        amount: parseSignedAmount(editAmount),
        occurredOn: editOccurredOn,
        billDueDate: isOverride ? editBillDueDate : null,
      },
    });
  };

  const [confirmingId, setConfirmingId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: TransactionsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', selectedCard?.id] });
      setConfirmingId(null);
    },
  });

  const cancelDelete = () => {
    setConfirmingId(null);
    deleteMutation.reset();
  };

  const isLoading = accountsQuery.isLoading || (!!selectedCard && transactionsQuery.isLoading);
  const dueDateObj = selectedBillDueDate ? parseLocalDate(selectedBillDueDate) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">{selectedCard ? selectedCard.name : 'Credit card'}</div>
          <div className="page-title">Card Bills</div>
        </div>
        {selectedCard && (
          <button className="btn btn-jade btn-sm" onClick={openForm}>
            <i className="bi bi-plus-lg me-1" />
            Add transaction
          </button>
        )}
      </div>

      {!accountsQuery.isLoading && allCards.length === 0 && (
        <div className="panel p-4 text-center text-muted-c" style={{ padding: 40, fontSize: 13 }}>
          No credit card accounts yet.
          <div className="mt-3">
            <Link to="/accounts" className="btn btn-jade btn-sm">
              Add a credit card in Accounts
            </Link>
          </div>
        </div>
      )}

      {!accountsQuery.isLoading && allCards.length > 0 && eligibleCards.length === 0 && (
        <div className="panel p-4 text-center text-muted-c" style={{ padding: 40, fontSize: 13 }}>
          Your credit card{allCards.length === 1 ? '' : 's'} need a due day of month set before bills can be tracked.
          <div className="mt-3">
            <Link to="/accounts" className="btn btn-jade btn-sm">
              Set it in Accounts
            </Link>
          </div>
        </div>
      )}

      {selectedCard && (
        <>
          {(eligibleCards.length > 1 || dueDateObj) && (
            <div className="nav-toolbar">
              {eligibleCards.length > 1 && (
                <select
                  className="form-select form-select-lg"
                  style={{ width: 'auto', minWidth: 220 }}
                  value={selectedCardId}
                  onChange={(e) => setSelectedCardId(e.target.value)}
                >
                  {eligibleCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              {dueDateObj && (
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="icon-btn icon-btn-lg"
                    title="Previous bill"
                    disabled={billDates.indexOf(selectedBillDueDate) <= 0}
                    onClick={() => stepBill('prev')}
                  >
                    <i className="bi bi-chevron-left" />
                  </button>
                  <span className="nav-toolbar-label" style={{ minWidth: 180, textAlign: 'center' }}>
                    {dueDateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} bill
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-lg"
                    title="Next bill"
                    disabled={
                      billDates.indexOf(selectedBillDueDate) === -1 ||
                      billDates.indexOf(selectedBillDueDate) >= billDates.length - 1
                    }
                    onClick={() => stepBill('next')}
                  >
                    <i className="bi bi-chevron-right" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="panel p-4 mb-4">
            <div className="eyebrow mb-2">Amount owed</div>
            <div className="hero-balance md" style={{ color: amountOwed > 0 ? 'var(--red)' : undefined }}>
              {money(amountOwed)}
            </div>
            {dueDateObj && (
              <div className="text-faint mt-1" style={{ fontSize: 11.5 }}>
                {dueDateLine(dueDateObj, today)}
              </div>
            )}
          </div>

          <div className="mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search description, category, or amount"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                    <label className="eyebrow d-block mb-2">Amount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control form-control-sm"
                      placeholder="12.50"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="eyebrow d-block mb-2">Date</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={occurredOn}
                      onChange={(e) => setOccurredOn(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="row g-3 align-items-end mt-1">
                  <div className="col-md-6">
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
                    <div className="col-md-6">
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
                  {repeat === 'NONE' && (
                    <div className="col-md-6">
                      <label className="eyebrow d-block mb-2">Bill</label>
                      <select
                        className="form-select form-select-sm"
                        value={billDueDate}
                        onChange={(e) => setBillDueDate(e.target.value)}
                      >
                        {billOptionsWithCurrent(selectedCard, occurredOn, billDueDate).map((d) => (
                          <option key={isoDate(d)} value={isoDate(d)}>
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} bill
                          </option>
                        ))}
                      </select>
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

          {isLoading && <div className="text-muted-c">Loading…</div>}

          {!isLoading && billTransactions.length === 0 && (
            <div className="panel p-4 text-muted-c" style={{ fontSize: 13 }}>
              No transactions in this bill yet.
            </div>
          )}

          {!isLoading && billTransactions.length > 0 && filteredBillTransactions.length === 0 && (
            <div className="panel p-4 text-muted-c" style={{ fontSize: 13 }}>
              No transactions match your search.
            </div>
          )}

          {!isLoading &&
            filteredBillTransactions.map((t) => {
              const catName = t.category?.name;
              const icon = t.category?.icon || categoryIcons[catName] || 'bi-dot';
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
                      <select
                        className="form-select form-select-sm"
                        style={{ maxWidth: 140 }}
                        value={editBillDueDate}
                        onChange={(e) => setEditBillDueDate(e.target.value)}
                      >
                        {billOptionsWithCurrent(selectedCard, editOccurredOn, editBillDueDate).map((d) => (
                          <option key={isoDate(d)} value={isoDate(d)}>
                            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} bill
                          </option>
                        ))}
                      </select>
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
                        <i className={iconClassName(icon)} />
                      </div>
                      <div className="txn-main">
                        <div className="txn-desc">
                          {t.description}
                          {t.seriesInfo && (
                            <span className="tag ms-2" style={{ verticalAlign: 'middle' }}>
                              {t.seriesInfo}
                            </span>
                          )}
                        </div>
                        <div className="txn-meta">
                          <span>{catName || 'Uncategorized'}</span>
                          <span className="dot-sep" />
                          <span>{t.occurredOn}</span>
                        </div>
                      </div>
                      <div className="txn-right">
                        <div className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                          {money(Number(t.amount), { signed: true })}
                        </div>
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
        </>
      )}
    </div>
  );
}
