import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AccountsApi, BudgetsApi, TransactionsApi } from '../api/ledger';
import Dropdown from '../components/Dropdown';
import { parseLocalDate, localYearMonth, startOfDay, dueLabel } from '../utils/date';
import { nextBillFor } from '../utils/creditCard';

const rangeOptions = [
  { value: 'week', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'month', label: 'This month' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
];

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function rangeBounds(range) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === 'week') return { start: startOfWeek(now), end };
  if (range === 'lastWeek') {
    const start = startOfWeek(now);
    start.setDate(start.getDate() - 7);
    const lastWeekEnd = startOfWeek(now);
    lastWeekEnd.setMilliseconds(-1);
    return { start, end: lastWeekEnd };
  }
  if (range === 'last30') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }
  if (range === 'year') return { start: new Date(now.getFullYear(), 0, 1), end };
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
}

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
  const [range, setRange] = useState('month');
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);

  const yearMonth = localYearMonth();
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

  const today = startOfDay(new Date());

  const accountBalances = useMemo(() => {
    const map = new Map();
    accounts.forEach((a, i) => {
      const raw = txnQueries[i]?.data || [];
      const sorted = [...raw].sort((x, y) => {
        const diff = parseLocalDate(x.occurredOn) - parseLocalDate(y.occurredOn);
        return diff !== 0 ? diff : x.id - y.id;
      });
      let balance = Number(a.openingBalance ?? 0);
      for (const t of sorted) {
        if (parseLocalDate(t.occurredOn) > today) break;
        balance = Number(t.runningBalance);
      }
      map.set(a.id, balance);
    });
    return map;
  }, [accounts, txnQueries, today]);

  const txnsByAccountId = useMemo(() => {
    const map = new Map();
    accounts.forEach((a, i) => map.set(a.id, txnQueries[i]?.data || []));
    return map;
  }, [accounts, txnQueries]);

  const liquidAccounts = accounts.filter((a) => a.kind === 'CHECKING' || a.kind === 'SAVINGS');
  const ccAccounts = accounts.filter((a) => a.kind === 'CREDIT_CARD');
  const investmentAccounts = accounts.filter((a) => a.kind === 'INVESTMENT');
  const totalBalance = liquidAccounts.reduce((sum, a) => sum + (accountBalances.get(a.id) ?? Number(a.balance)), 0);

  // Sum of each card's next open bill (same nextBillFor call the "Credit
  // cards" tiles below use) — so the total always matches what's shown on
  // screen, regardless of which calendar month that next bill happens to
  // land in. A card with nothing owed yet contributes 0.
  const totalCardDebt = ccAccounts.reduce(
    (sum, a) => sum + Math.max(nextBillFor(a, txnsByAccountId.get(a.id) || [], today)?.amountOwed ?? 0, 0),
    0
  );
  const totalInvestments = investmentAccounts.reduce(
    (sum, a) => sum + (accountBalances.get(a.id) ?? Number(a.balance)),
    0
  );
  const { start, end } = rangeBounds(range);
  const recent = txnQueries
    .flatMap((q) => q.data || [])
    .filter((t) => {
      const occurred = parseLocalDate(t.occurredOn);
      return occurred >= start && occurred <= end;
    })
    .sort((a, b) => parseLocalDate(b.occurredOn) - parseLocalDate(a.occurredOn))
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
        <Dropdown icon="bi-calendar3" options={rangeOptions} value={range} onChange={setRange} />
      </div>

      <div className="panel p-4 mb-4">
        {accountsQuery.isLoading ? (
          <div className="text-muted-c">Loading…</div>
        ) : (
          <div className="row align-items-end g-3">
            <div className="col-md-4">
              <div className="eyebrow mb-2">Current balance</div>
              <div className="hero-balance">{money(totalBalance)}</div>
              <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
                across {liquidAccounts.length} checking &amp; savings account{liquidAccounts.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="col-md-4">
              <div className="eyebrow mb-2">Credit card debt</div>
              <div className="hero-balance md" style={{ color: totalCardDebt > 0 ? 'var(--red)' : undefined }}>
                {money(totalCardDebt)}
              </div>
              <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
                across {ccAccounts.length} card{ccAccounts.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="col-md-4">
              <div className="eyebrow mb-2">Total investments</div>
              <div className="hero-balance md">{money(totalInvestments)}</div>
              <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
                across {investmentAccounts.length} account{investmentAccounts.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="row g-3 mb-4">
        <div className="eyebrow mb-2">Checking & Savings accounts</div>
        {liquidAccounts.map((a) => {
          const bal = accountBalances.get(a.id) ?? Number(a.balance);
          return (
            <div className="col-6 col-md-3" key={a.id}>
              <div className="acct-card">
                <div className="acct-kind">{a.kind?.replace('_', ' ')}</div>
                <div className="acct-balance" style={{ color: bal < 0 ? 'var(--red)' : undefined }}>
                  {money(bal)}
                </div>
                <div className="acct-name">{a.name}</div>
              </div>
            </div>
          );
        })}
        {accounts.length === 0 && !accountsQuery.isLoading && (
          <div className="col-12 text-muted-c" style={{ fontSize: 13 }}>
            No accounts yet — add one from the Accounts page to get started.
          </div>
        )}
      </div>

      {investmentAccounts.length > 0 && (
        <div className="row g-3 mb-4">
          <div className="eyebrow mb-2">Investments</div>
          {investmentAccounts.map((a) => {
            const bal = accountBalances.get(a.id) ?? Number(a.balance);
            return (
              <div className="col-6 col-md-3" key={a.id}>
                <div className="acct-card">
                  <div className="acct-kind">{a.kind?.replace('_', ' ')}</div>
                  <div className="acct-balance" style={{ color: bal < 0 ? 'var(--red)' : undefined }}>
                    {money(bal)}
                  </div>
                  <div className="acct-name">{a.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ccAccounts.length > 0 && (
        <div className="mb-4">
          <div className="eyebrow mb-2">Credit cards</div>
          <div className="row g-3">
            {ccAccounts.map((c) => {
              const bill = nextBillFor(c, txnsByAccountId.get(c.id) || [], today);
              return (
                <div className="col-6 col-md-3" key={c.id}>
                  <div className="acct-card">
                    <div className="acct-kind">Credit card</div>
                    <div className="acct-balance" style={{ color: bill?.amountOwed > 0 ? 'var(--red)' : undefined }}>
                      {bill ? money(bill.amountOwed) : '—'}
                    </div>
                    <div className="acct-name">{c.name}</div>
                    <div className="text-faint mt-1" style={{ fontSize: 11 }}>
                      {bill ? dueLabel(bill.dueDate) : 'No due day set'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Recent activity</div>
            </div>
            {recent.length === 0 ? (
              <div className="p-4 text-muted-c" style={{ fontSize: 13 }}>
                No transactions in this range.
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
