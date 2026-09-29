import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AccountsApi,
  CategoriesApi,
  CreditCardBillsApi,
  TransactionsApi,
} from '../api/ledger';
import { parseLocalDate, startOfDay, isoDate, nextDueDate } from '../utils/date';
import { toCsv, downloadCsv } from '../utils/export';
import { iconClassName } from '../constants/categoryIcons';
import { useStickyHeader } from '../hooks/useStickyHeader';
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
  'Card payment': '#8B92A0',
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
  'Card payment': 'bi-credit-card',
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
  const { sentinelRef, progress, isStuck } = useStickyHeader();

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = useMemo(
    () => [...(accountsQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name)),
    [accountsQuery.data]
  );
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

  // Keyed on the card's id, not the card object, so a background refetch
  // that returns a new object reference for the same card (window focus,
  // an unrelated mutation invalidating ['accounts']) doesn't clobber a
  // payment account the user already picked in the still-open pay form.
  useEffect(() => {
    setPaymentAccountId(selectedCard?.paymentAccount?.id ? String(selectedCard.paymentAccount.id) : '');
  }, [selectedCard?.id, selectedCard?.paymentAccount?.id]);

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

  const billsQuery = useQuery({
    queryKey: ['credit-card-bills', selectedCard?.id],
    queryFn: () => CreditCardBillsApi.list(selectedCard.id),
    enabled: !!selectedCard,
  });
  const billsByDueDate = useMemo(() => {
    const map = new Map();
    for (const bill of billsQuery.data || []) {
      if (bill.dueDate) map.set(bill.dueDate, bill);
    }
    return map;
  }, [billsQuery.data]);

  const defaultBillDueDate = useMemo(() => {
    if (!billDates.length) return '';
    for (const dueDate of billDates) {
      if (!dueDate) continue;
      const bill = billsByDueDate.get(dueDate);
      if (!bill || (!bill.consolidated && !bill.paid)) return dueDate;
    }
    return nextBill?.dueDate ? isoDate(nextBill.dueDate) : billDates[billDates.length - 1] || '';
  }, [billDates, billsByDueDate, nextBill]);

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

  // Once the list of bills is loaded, if the currently selected default is
  // already consolidated/paid and a future bill exists, advance to that bill so
  // the user doesn't have to click "Next bill" repeatedly on every visit.
  useEffect(() => {
    if (!selectedCard || !billDates.length || !billsQuery.isSuccess) return;
    if (selectedBillDueDate && !userSteppedAway.current) {
      const bill = billsByDueDate.get(selectedBillDueDate);
      if (bill && (bill.consolidated || bill.paid)) {
        const currentIdx = billDates.indexOf(selectedBillDueDate);
        if (currentIdx >= 0 && currentIdx < billDates.length - 1) {
          setSelectedBillDueDate(billDates[currentIdx + 1]);
        }
      }
    }
  }, [billsByDueDate, billDates, billsQuery.isSuccess, selectedBillDueDate, selectedCard]);

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
  const [isReviewing, setIsReviewing] = useState(false);
  const [markedIds, setMarkedIds] = useState(new Set());

  const creditCardBillQuery = useQuery({
    queryKey: ['credit-card-bills', selectedCard?.id, selectedBillDueDate],
    queryFn: () => CreditCardBillsApi.find(selectedCard.id, selectedBillDueDate),
    enabled: !!selectedCard && !!selectedBillDueDate,
  });

  useEffect(() => {
    if (!isReviewing) {
      setMarkedIds(new Set());
    }
  }, [isReviewing, selectedCard, selectedBillDueDate]);

  const consolidateMutation = useMutation({
    mutationFn: () =>
      CreditCardBillsApi.consolidate({
        accountId: selectedCard.id,
        dueDate: selectedBillDueDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['credit-card-bills', selectedCard?.id, selectedBillDueDate],
      });
      setIsReviewing(false);
      setMarkedIds(new Set());
    },
  });

  const handleExport = () => {
    const cardName = selectedCard ? selectedCard.name.replace(/\s+/g, '_') : 'card';
    downloadCsv(toCsv(filteredBillTransactions), `card-bills-${cardName}.csv`);
  };

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

  const [showPayForm, setShowPayForm] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentDebitAuthorized, setPaymentDebitAuthorized] = useState(false);

  // If the bill currently in view is already paid, new transactions should
  // default to the following bill instead of one that's guaranteed to be
  // rejected on submit — the paid due date is still reachable manually via
  // the form's "Bill" dropdown, it's just not what a fresh Add starts on.
  const nextUnpaidBillDueDate = useMemo(() => {
    if (!selectedCard || !selectedBillDueDate) return selectedBillDueDate;
    if (!creditCardBillQuery.data?.paid) return selectedBillDueDate;
    const paidDue = parseLocalDate(selectedBillDueDate);
    const following = nextDueDate(
      selectedCard.dueDayOfMonth,
      new Date(paidDue.getFullYear(), paidDue.getMonth() + 1, 1)
    );
    return isoDate(following);
  }, [selectedCard, selectedBillDueDate, creditCardBillQuery.data?.paid]);

  const openForm = () => {
    if (!showForm) {
      setOccurredOn(todayIso());
      setBillDueDate(nextUnpaidBillDueDate);
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
      setBillDueDate(nextUnpaidBillDueDate);
      setShowForm(true);
    }
  }, [searchParams, selectedCard, selectedBillDueDate, nextUnpaidBillDueDate]);

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

  const resetPayForm = () => {
    setShowPayForm(false);
    setPaymentAccountId(selectedCard?.paymentAccount?.id ? String(selectedCard.paymentAccount.id) : '');
    setPaymentDate(todayIso());
    setPaymentCompleted(false);
    setPaymentDebitAuthorized(false);
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
    const isOverride = billDueDate && (!naturalBill || billDueDate !== isoDate(naturalBill));
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

  const eligiblePaymentAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'CHECKING' || a.kind === 'SAVINGS').sort((a, b) => a.name.localeCompare(b.name)),
    [accounts]
  );

  const handlePaySubmit = (e) => {
    e.preventDefault();
    const payload = {
      dueDate: selectedBillDueDate,
      paymentDate,
      paymentAccountId: paymentAccountId ? Number(paymentAccountId) : null,
      completed: paymentCompleted,
      debitAuthorized: paymentDebitAuthorized,
    };
    if (creditCardBillQuery.data?.paid) {
      updatePaymentMutation.mutate({ accountId: selectedCard.id, payload });
    } else {
      payMutation.mutate({ accountId: selectedCard.id, payload });
    }
  };

  const openEditPayment = () => {
    const bill = creditCardBillQuery.data;
    setPaymentAccountId(bill?.paymentAccount?.id ? String(bill.paymentAccount.id) : '');
    setPaymentDate(bill?.paymentDate || todayIso());
    setPaymentCompleted(!!bill?.paymentTransaction?.completed);
    setPaymentDebitAuthorized(!!bill?.paymentTransaction?.debitAuthorized);
    setShowPayForm(true);
  };

  const [editingId, setEditingId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editOccurredOn, setEditOccurredOn] = useState('');
  const [editBillDueDate, setEditBillDueDate] = useState('');
  const [editScope, setEditScope] = useState('THIS');

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => TransactionsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', selectedCard?.id] });
      setEditingId(null);
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ accountId, payload }) => CreditCardBillsApi.pay(accountId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills', selectedCard?.id, selectedBillDueDate] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      resetPayForm();
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ accountId, payload }) => CreditCardBillsApi.updatePayment(accountId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills', selectedCard?.id, selectedBillDueDate] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      resetPayForm();
    },
  });

  const [confirmingUnpay, setConfirmingUnpay] = useState(false);

  const unpayMutation = useMutation({
    mutationFn: ({ accountId, dueDate }) => CreditCardBillsApi.unpay(accountId, dueDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-card-bills', selectedCard?.id, selectedBillDueDate] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setConfirmingUnpay(false);
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
    setEditScope('THIS');
  };

  const handleEditSubmit = (e, t) => {
    e.preventDefault();
    const naturalBill = billOptionsFor(selectedCard, editOccurredOn)[0];
    const isOverride = editBillDueDate && (!naturalBill || editBillDueDate !== isoDate(naturalBill));
    updateMutation.mutate({
      id: t.id,
      payload: {
        categoryId: editCategoryId ? Number(editCategoryId) : null,
        description: editDescription,
        amount: parseSignedAmount(editAmount),
        occurredOn: editOccurredOn,
        billDueDate: isOverride ? editBillDueDate : null,
        scope: t.seriesId ? editScope : undefined,
      },
    });
  };

  const [confirmingId, setConfirmingId] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: ({ id, scope }) => TransactionsApi.remove(id, scope),
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
      <div ref={sentinelRef} />
      <div
        className={`sticky-page-header${isStuck ? ' is-stuck' : ''}`}
        style={{ '--header-scale': progress }}
      >
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">{selectedCard ? selectedCard.name : 'Credit card'}</div>
          <div className="page-title">Card Bills</div>
        </div>
        {selectedCard ? (
          <div className="d-flex align-items-center gap-2">
            {selectedCard?.dueDayOfMonth != null && !creditCardBillQuery.data?.paid && (
              <button
                className="btn btn-jade btn-sm"
                onClick={() => {
                  if (isReviewing) {
                    consolidateMutation.mutate();
                  } else {
                    setIsReviewing(true);
                  }
                }}
                disabled={consolidateMutation.isPending}
              >
                {isReviewing ? 'Finish review' : 'Start review'}
              </button>
            )}
            {creditCardBillQuery.data?.paid ? (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={openEditPayment}
                  disabled={updatePaymentMutation.isPending}
                >
                  <i className="bi bi-pencil me-1" />
                  Edit payment
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmingUnpay(true)}
                  disabled={unpayMutation.isPending}
                >
                  <i className="bi bi-arrow-counterclockwise me-1" />
                  Unpay
                </button>
              </>
            ) : (
              <button
                className="btn btn-jade btn-sm"
                onClick={() => setShowPayForm((s) => !s)}
                disabled={payMutation.isPending}
              >
                <i className="bi bi-cash-coin me-1" />
                Pay bill
              </button>
            )}
            {/* Not gated on the viewed bill's paid status — a paid bill only
                blocks adding to that specific due date (enforced server-side);
                the form itself defaults to the following bill. */}
            <button className="btn btn-jade btn-sm" onClick={openForm}>
              <i className="bi bi-plus-lg me-1" />
              Add transaction
            </button>
          </div>
        ) : (
          !accountsQuery.isLoading &&
          allCards.length === 0 && (
            <Link to="/accounts?add=credit-card" className="btn btn-jade btn-sm">
              <i className="bi bi-plus-lg me-1" />
              Add credit card
            </Link>
          )
        )}
      </div>

      {selectedCard && (eligibleCards.length > 1 || dueDateObj) && (
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
      </div>

      {!accountsQuery.isLoading && allCards.length === 0 && (
        <div className="panel p-4 text-center text-muted-c" style={{ padding: 40, fontSize: 13 }}>
          No credit card accounts yet.
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
            {creditCardBillQuery.data?.paid && (
              <div className="mt-2" style={{ fontSize: 13 }}>
                <div className="d-inline-flex align-items-center gap-1" style={{ color: 'var(--jade)', fontWeight: 500 }}>
                  <i className="bi bi-cash-coin" />
                  Paid
                  {creditCardBillQuery.data.paymentDate &&
                    ` ${parseLocalDate(creditCardBillQuery.data.paymentDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}`}
                  {creditCardBillQuery.data.paymentAccount?.name &&
                    ` from ${creditCardBillQuery.data.paymentAccount.name}`}
                </div>
                <div className="d-flex gap-2 mt-1">
                  {creditCardBillQuery.data.paymentTransaction?.completed && (
                    <span className="tag">Completed</span>
                  )}
                  {creditCardBillQuery.data.paymentTransaction?.debitAuthorized && (
                    <span className="tag">Debit authorized</span>
                  )}
                </div>
              </div>
            )}
            {creditCardBillQuery.data?.consolidated && !creditCardBillQuery.data?.paid && (
              <div className="mt-2 d-inline-flex align-items-center gap-1" style={{ color: 'var(--jade)', fontSize: 13, fontWeight: 500 }}>
                <i className="bi bi-check-circle-fill" />
                Consolidated
              </div>
            )}
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search description, category, or amount"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-ghost btn-sm ms-2" onClick={handleExport}>
              <i className="bi bi-download me-1" />
              Export
            </button>
          </div>

          {confirmingUnpay && (
            <div className="panel p-4 mb-4 d-flex align-items-center gap-3 flex-wrap">
              <span style={{ fontWeight: 500, fontSize: 13.5 }}>Unpay this bill?</span>
              <span className="text-faint" style={{ fontSize: 12.5 }}>
                Deletes the payment transaction and restores the projected bill.
              </span>
              <div className="d-flex gap-2 ms-auto">
                <button
                  className="btn btn-red btn-sm"
                  disabled={unpayMutation.isPending}
                  onClick={() =>
                    unpayMutation.mutate({ accountId: selectedCard.id, dueDate: selectedBillDueDate })
                  }
                >
                  {unpayMutation.isPending ? 'Unpaying…' : 'Unpay'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingUnpay(false)}>
                  Cancel
                </button>
              </div>
              {unpayMutation.isError && (
                <div className="w-100" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                  Could not unpay this bill.
                </div>
              )}
            </div>
          )}

          {showPayForm && (
            <div className="panel p-4 mb-4">
              <form onSubmit={handlePaySubmit}>
                <div className="row g-3 align-items-end">
                  <div className="col-md-3">
                    <label className="eyebrow d-block mb-2">Payment account</label>
                    <select
                      className="form-select form-select-sm"
                      value={paymentAccountId}
                      onChange={(e) => setPaymentAccountId(e.target.value)}
                      required
                    >
                      <option value="">Select account</option>
                      {eligiblePaymentAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="eyebrow d-block mb-2">Payment date</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="eyebrow d-block mb-2">Amount</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={money(amountOwed)}
                      disabled
                    />
                  </div>
                  <div className="col-md-3">
                    <div className="d-flex gap-3" style={{ fontSize: 13 }}>
                      <label className="d-flex align-items-center gap-1">
                        <input
                          type="checkbox"
                          checked={paymentCompleted}
                          onChange={(e) => setPaymentCompleted(e.target.checked)}
                        />
                        Completed
                      </label>
                      <label className="d-flex align-items-center gap-1">
                        <input
                          type="checkbox"
                          checked={paymentDebitAuthorized}
                          onChange={(e) => setPaymentDebitAuthorized(e.target.checked)}
                        />
                        Debit authorized
                      </label>
                    </div>
                  </div>
                </div>
                <div className="row mt-3">
                  <div className="col-12 d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPayForm(false)}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-jade btn-sm"
                      disabled={payMutation.isPending || updatePaymentMutation.isPending || amountOwed <= 0}
                    >
                      {creditCardBillQuery.data?.paid
                        ? updatePaymentMutation.isPending
                          ? 'Saving…'
                          : 'Save changes'
                        : payMutation.isPending
                          ? 'Paying…'
                          : 'Pay'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

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
                  <div className="col-md-6">
                    <label className="eyebrow d-block mb-2">{repeat === 'NONE' ? 'Bill' : 'First bill'}</label>
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
                  {repeat !== 'NONE' && (
                    <div className="col-12 text-faint" style={{ fontSize: 11.5 }}>
                      {repeat === 'INSTALLMENTS'
                        ? `Splits the amount evenly into ${occurrences || 'N'} monthly transactions.`
                        : `Creates ${occurrences || 'N'} ${repeat.toLowerCase()} transactions of the same amount, starting on the date above.`}
                      {' '}Picking a bill other than the natural one shifts every occurrence by the same number of bills.
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
                  {createMutation.isError && (
                    <div className="col-12 text-end mt-1" style={{ fontSize: 11.5, color: 'var(--red)' }}>
                      {createMutation.error?.response?.data?.message ||
                        'That bill is already paid — pick a different one or unpay it first.'}
                    </div>
                  )}
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
              const isMarked = markedIds.has(t.id);
              const toggleMarked = () => {
                if (!isReviewing || t.linkedBudget) return;
                setMarkedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(t.id)) {
                    next.delete(t.id);
                  } else {
                    next.add(t.id);
                  }
                  return next;
                });
              };
              return (
                <div
                  className={`txn-row ${isReviewing ? 'reviewable' : ''} ${isMarked ? 'marked' : ''}`}
                  key={t.id}
                  onClick={toggleMarked}
                  style={{
                    cursor: isReviewing && !t.linkedBudget ? 'pointer' : undefined,
                    borderStyle: t.linkedBudget ? 'dashed' : undefined,
                  }}
                >
                  {editingId === t.id ? (
                    <form
                      onSubmit={(e) => handleEditSubmit(e, t)}
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
                      <span style={{ fontWeight: 500, fontSize: 13.5 }}>Delete this transaction?</span>
                      <span className="text-faint" style={{ fontSize: 12.5 }}>
                        This cannot be undone.
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
                          {t.linkedBudget && (
                            <span className="tag ms-2" style={{ verticalAlign: 'middle' }}>
                              Budget
                            </span>
                          )}
                        </div>
                        <div className="txn-meta">
                          <span>{catName || 'Uncategorized'}</span>
                          <span className="dot-sep" />
                          <span className="txn-date">
                            {parseLocalDate(t.occurredOn).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="txn-right">
                        <div className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                          {money(Number(t.amount), { signed: true })}
                        </div>
                      </div>
                      <div className="d-flex gap-1 ms-2">
                        {isReviewing && isMarked && (
                          <span className="badge-marked" title="Marked">
                            <i className="bi bi-check-lg" />
                          </span>
                        )}
                        {!t.linkedBudget && (
                          <>
                            <button className="icon-btn" title="Edit transaction" onClick={() => startEdit(t)}>
                              <i className="bi bi-pencil" />
                            </button>
                            <button className="icon-btn" title="Delete transaction" onClick={() => setConfirmingId(t.id)}>
                              <i className="bi bi-trash" />
                            </button>
                          </>
                        )}
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
