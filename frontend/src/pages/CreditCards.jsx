import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AccountsApi, TransactionsApi } from '../api/ledger';
import { nextDueDate, dueLabel, startOfDay, isoDate } from '../utils/date';
import { nextBillFor } from '../utils/creditCard';

function money(amount) {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function creditStatusFor(owed, limit) {
  const pct = limit > 0 ? (owed / limit) * 100 : 0;
  if (pct >= 100) return { label: 'Over limit', cls: 'status-over', color: 'var(--red)' };
  if (pct >= 85) return { label: 'Near limit', cls: 'status-warn', color: 'var(--gold)' };
  return { label: 'Good standing', cls: 'status-ok', color: 'var(--jade)' };
}

export default function CreditCards() {
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: AccountsApi.list });
  const cards = (accountsQuery.data || []).filter((a) => a.kind === 'CREDIT_CARD');

  const txnQueries = useQueries({
    queries: cards.map((c) => ({
      queryKey: ['transactions', c.id],
      queryFn: () => TransactionsApi.listByAccount(c.id),
      enabled: !!c.id,
    })),
  });
  const today = startOfDay(new Date());
  const txnsByCardId = new Map(cards.map((c, i) => [c.id, txnQueries[i]?.data || []]));

  const owed = (c) => Math.max(-Number(c.balance), 0);
  const totalOwed = cards.reduce((s, c) => s + owed(c), 0);
  const cardsWithLimit = cards.filter((c) => c.creditLimit != null);
  const totalLimit = cardsWithLimit.reduce((s, c) => s + Number(c.creditLimit), 0);
  // Available credit only makes sense across cards that actually have a
  // limit — a no-limit card's debt shouldn't eat into another card's
  // available credit just because it's excluded from totalLimit above.
  const owedOnLimitedCards = cardsWithLimit.reduce((s, c) => s + owed(c), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow mb-1">
            {cards.length} credit card{cards.length === 1 ? '' : 's'}
          </div>
          <div className="page-title">Credit Cards</div>
        </div>
        <Link to="/accounts?add=credit-card" className="btn btn-jade btn-sm">
          <i className="bi bi-plus-lg me-1" />
          Add credit card
        </Link>
      </div>

      <div className="panel p-4 mb-4">
        <div className="row align-items-end g-3">
          <div className="col-md-5">
            <div className="eyebrow mb-2">Total owed across all cards</div>
            <div className="hero-balance md" style={{ color: totalOwed > 0 ? 'var(--red)' : undefined }}>
              {money(totalOwed)}
            </div>
          </div>
          <div className="col-md-7">
            <div className="row g-3 text-center text-md-start">
              <div className="col-4">
                <div className="eyebrow mb-1">Total limit</div>
                <div className="mono" style={{ fontSize: 16 }}>
                  {cardsWithLimit.length ? money(totalLimit) : '—'}
                </div>
              </div>
              <div className="col-4">
                <div className="eyebrow mb-1">Available credit</div>
                <div className="mono" style={{ fontSize: 16, color: 'var(--jade)' }}>
                  {cardsWithLimit.length ? money(totalLimit - owedOnLimitedCards) : '—'}
                </div>
              </div>
              <div className="col-4">
                <div className="eyebrow mb-1">Cards</div>
                <div className="mono" style={{ fontSize: 16 }}>
                  {cards.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {accountsQuery.isLoading && <div className="text-muted-c">Loading…</div>}

      {!accountsQuery.isLoading && cards.length === 0 && (
        <div className="panel p-4 text-center text-muted-c" style={{ padding: 40, fontSize: 13 }}>
          No credit card accounts yet.
        </div>
      )}

      <div className="row g-3">
        {cards.map((c) => {
          const amountOwed = owed(c);
          const limit = c.creditLimit != null ? Number(c.creditLimit) : null;
          const st = limit != null ? creditStatusFor(amountOwed, limit) : null;
          const pct = limit ? Math.min((amountOwed / limit) * 100, 100) : 0;
          const due = c.dueDayOfMonth != null ? nextDueDate(c.dueDayOfMonth) : null;
          const bill = nextBillFor(c, txnsByCardId.get(c.id) || [], today);
          return (
            <div className="col-md-6 col-lg-4" key={c.id}>
              <div className="account-card-lg">
                <div className="account-icon">
                  <i className="bi bi-credit-card text-muted-c" />
                </div>
                <div className="acct-kind">{c.name}</div>
                <div className="acct-balance" style={{ color: amountOwed > 0 ? 'var(--red)' : undefined }}>
                  {money(amountOwed)}
                </div>
                <div className="text-faint mb-2" style={{ fontSize: 11.5 }}>
                  {limit != null ? `Limit ${money(limit)}` : 'No credit limit set'}
                </div>
                {limit != null && (
                  <>
                    <div className="track">
                      <div className="track-fill" style={{ width: `${pct}%`, background: st.color }} />
                    </div>
                    <div className={`budget-status ${st.cls}`}>{st.label}</div>
                  </>
                )}
                {due && (
                  <div className="text-faint mt-2" style={{ fontSize: 11.5 }}>
                    {dueLabel(due)}
                  </div>
                )}
                <Link
                  to={`/card-bills?account=${c.id}${bill ? `&bill=${isoDate(bill.dueDate)}` : ''}`}
                  className="btn btn-ghost btn-sm w-100 mt-3"
                >
                  View transactions
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
