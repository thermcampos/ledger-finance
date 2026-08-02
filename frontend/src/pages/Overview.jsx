import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { AccountsApi, BudgetsApi, TransactionsApi } from '../api/ledger';
import { localYearMonth, startOfDay, isoDate, dueLabel, parseLocalDate } from '../utils/date';
import { nextBillFor } from '../utils/creditCard';
import { balanceAsOf, sortChronologically } from '../utils/balance';

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

function toBcbDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${m}-${d}-${y}`;
}

async function fetchPtaxRate(isoDate) {
  const bcbDate = toBcbDate(isoDate);
  const url =
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)` +
    `?@dataCotacao='${bcbDate}'&$format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not reach Banco Central.');
  const data = await res.json();
  if (!data.value || data.value.length === 0) {
    throw new Error('No rate published for this date (weekend or holiday).');
  }
  return data.value[0];
}

function money(amount, { signed = false, hidden = false } = {}) {
  if (hidden) return '••••';
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = amount < 0 ? '-' : signed ? '+' : '';
  return `${sign}$${value}`;
}

export default function Overview() {
  const [hideValues, setHideValues] = useState(false);
  const [dueSoonOpen, setDueSoonOpen] = useState(true);
  const [rateDate, setRateDate] = useState(() => isoDate(new Date()));
  const rateMutation = useMutation({ mutationFn: fetchPtaxRate });

  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);

  const yearMonth = localYearMonth();
  const budgetsQuery = useQuery({
    queryKey: ['budgets'],
    queryFn: () => BudgetsApi.list(),
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
      map.set(a.id, balanceAsOf(a, sortChronologically(txnQueries[i]?.data || []), today));
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
  // "Latest added" — global across all accounts, not sorted by occurredOn,
  // since a backdated/future entry can still be the most recently added
  // one. System-generated credit card bill rows (linkedCard set) aren't
  // something the user "added," so they're excluded here.
  const recent = txnQueries
    .flatMap((q) => q.data || [])
    .filter((t) => !t.linkedCard)
    .sort((a, b) => {
      const diff = new Date(b.createdAt) - new Date(a.createdAt);
      return diff !== 0 ? diff : b.id - a.id;
    })
    .slice(0, 5);

  // Due soon — checking-account transactions only (excludes credit card bill
  // projection rows, which land on the payment account but carry linkedCard)
  // landing from today through two days out. No "overdue" bucket: ordinary
  // transactions have no paid/pending status, so a past occurredOn can't be
  // distinguished from one that's already settled.
  const dueSoonEnd = new Date(today);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 2);
  const dueSoon = txnQueries
    .flatMap((q) => q.data || [])
    .filter((t) => t.account?.kind === 'CHECKING' && !t.linkedCard)
    .filter((t) => {
      const d = parseLocalDate(t.occurredOn);
      return d >= today && d <= dueSoonEnd;
    })
    .sort((a, b) => {
      const diff = parseLocalDate(a.occurredOn) - parseLocalDate(b.occurredOn);
      return diff !== 0 ? diff : a.id - b.id;
    });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="page-title">Overview</div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setHideValues((v) => !v)}
          title={hideValues ? 'Show values' : 'Hide values'}
          aria-label={hideValues ? 'Show values' : 'Hide values'}
        >
          <i className={`bi ${hideValues ? 'bi-eye-slash' : 'bi-eye'}`} />
        </button>
      </div>

      {/* Current balance panel */}
      <div className="panel p-4 mb-4">
        {accountsQuery.isLoading ? (
          <div className="text-muted-c">Loading…</div>
        ) : (
          <div className="row align-items-end g-3">
            <div className="col-md-4">
              <div className="eyebrow mb-2">Current balance</div>
              <div className="hero-balance">{money(totalBalance, { hidden: hideValues })}</div>
              <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
                across {liquidAccounts.length} checking &amp; savings account{liquidAccounts.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="col-md-4">
              <div className="eyebrow mb-2">Credit card debt</div>
              <div className="mono stat-figure" style={{ color: totalCardDebt > 0 ? 'var(--red)' : undefined }}>
                {money(totalCardDebt, { hidden: hideValues })}
              </div>
              <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
                across {ccAccounts.length} card{ccAccounts.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="col-md-4">
              <div className="eyebrow mb-2">Total investments</div>
              <div className="mono stat-figure">{money(totalInvestments, { hidden: hideValues })}</div>
              <div className="text-muted-c mt-2" style={{ fontSize: 12.5 }}>
                across {investmentAccounts.length} account{investmentAccounts.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Due soon panel */}
      <div className="panel mb-4">
        <div
          className="panel-header"
          role="button"
          tabIndex={0}
          onClick={() => setDueSoonOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDueSoonOpen((v) => !v);
            }
          }}
          style={{ cursor: 'pointer' }}
          title={dueSoonOpen ? 'Collapse' : 'Expand'}
          aria-expanded={dueSoonOpen}
        >
          <div className="panel-title">Due soon</div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            tabIndex={-1}
            aria-hidden="true"
          >
            <i className={`bi ${dueSoonOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
          </button>
        </div>
        {!dueSoonOpen ? null : dueSoon.length === 0 ? (
          <div className="p-4 text-muted-c" style={{ fontSize: 13 }}>
            No transactions in the next two days.
          </div>
        ) : (
          dueSoon.map((t) => {
            const catName = t.linkedCard ? 'Card payment' : t.category?.name || 'Uncategorized';
            return (
              <div className="feed-row" key={t.id}>
                <div className="feed-left">
                  <span
                    className="cat-tick"
                    style={{ background: t.linkedCard ? '#8B92A0' : categoryColors[t.category?.name] || '#8B92A0' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="feed-desc">{t.description}</div>
                    <div className="text-faint" style={{ fontSize: 11.5 }}>
                      {catName} · {dueLabel(parseLocalDate(t.occurredOn), today)} in {t.account.name}
                    </div>
                  </div>
                </div>
                <span className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                  {money(Number(t.amount), { signed: true, hidden: hideValues })}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* USD BRL exchange rate panel */}
      <div className="panel p-4 mb-4">
        <div className="panel-title mb-3">USD/BRL exchange rate (PTAX)</div>
        <div className="row g-3 align-items-end">
          <div className="col-6 col-md-3">
            <label className="eyebrow d-block mb-2">Date</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={rateDate}
              max={isoDate(new Date())}
              onChange={(e) => setRateDate(e.target.value)}
            />
          </div>
          <div className="col-6 col-md-2">
            <button
              type="button"
              className="btn btn-jade btn-sm"
              disabled={rateMutation.isPending || !rateDate}
              onClick={() => rateMutation.mutate(rateDate)}
            >
              {rateMutation.isPending ? 'Fetching…' : 'Get rates'}
            </button>
          </div>
          {rateMutation.isSuccess && (
            <div className="col-12 col-md-7" style={{ textAlign: 'right' }}>
              <div className="eyebrow mb-1">Buy rate (BID)</div>
              <div className="mono" style={{ fontSize: 19, fontWeight: 500 }}>
                R$ {Number(rateMutation.data.cotacaoCompra).toFixed(4)}
              </div>
            </div>
          )}
        </div>
        {rateMutation.isError && (
          <div className="mt-2" style={{ fontSize: 11.5, color: 'var(--red)' }}>
            {rateMutation.error.message}
          </div>
        )}
      </div>

      {/* Checking and Saving accounts cards */}
      <div className="row g-3 mb-4">
        <div className="eyebrow mb-2">Checking & Savings accounts</div>
        {liquidAccounts.map((a) => {
          const bal = accountBalances.get(a.id) ?? Number(a.balance);
          return (
            <div className="col-6 col-md-3" key={a.id}>
              <div className="acct-card">
                <div className="acct-kind">{a.kind?.replace('_', ' ')}</div>
                <div className="acct-balance" style={{ color: bal < 0 ? 'var(--red)' : undefined }}>
                  {money(bal, { hidden: hideValues })}
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

      {/* Investments accounts cards */}
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
                    {money(bal, { hidden: hideValues })}
                  </div>
                  <div className="acct-name">{a.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Credit-cards account cards */}
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
                      {bill ? money(bill.amountOwed, { hidden: hideValues }) : '—'}
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

      {/* Recent activity and budgets panels */}
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
                    {money(Number(t.amount), { signed: true, hidden: hideValues })}
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
                const rawPct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                return (
                  <div key={b.id} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: 12.5 }}>
                      <span className="d-flex align-items-center gap-2">
                        <span className="cat-tick" style={{ background: b.category?.colorHex || '#8B92A0' }} />
                        {b.category?.name}
                      </span>
                      <span className="d-flex align-items-center gap-2">
                        <span className="mono text-muted-c" style={{ fontSize: 12 }}>
                          {rawPct}%
                        </span>
                        <span className="mono text-muted-c" style={{ fontSize: 12 }}>
                          {money(spent, { hidden: hideValues })} / {money(limit, { hidden: hideValues })}
                        </span>
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
