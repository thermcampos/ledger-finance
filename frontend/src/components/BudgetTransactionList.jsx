import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BudgetsApi } from '../api/ledger';
import { parseLocalDate, isoDate } from '../utils/date';

function money(amount) {
  const value = Math.abs(Number(amount)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = Number(amount) < 0 ? '-' : '';
  return `${sign}$${value}`;
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

export default function BudgetTransactionList({ yearMonth, categoryId }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['budget-transactions', yearMonth, categoryId],
    queryFn: () => BudgetsApi.transactionsForBudget(yearMonth, categoryId),
    enabled: !!categoryId,
  });

  // Drop future-dated rows (pre-generated repeat/installment occurrences):
  // they don't count toward the month's spent, so listing them would make the
  // cumulative diverge from the budget card total.
  const visible = useMemo(() => {
    const today = isoDate(new Date());
    return data.filter((t) => t.occurredOn <= today);
  }, [data]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of visible) {
      const label = dayLabel(t.occurredOn);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }
    return Array.from(map.entries());
  }, [visible]);

  // Cumulative spend in display order (newest first): each row shows the
  // running total of the amounts listed so far, so the last row matches the
  // budget card's "spent" figure. Amounts are signed (expenses negative,
  // refunds positive), so negate: expenses add to the total, refunds subtract.
  const cumulativeById = useMemo(() => {
    const map = new Map();
    let total = 0;
    for (const t of visible) {
      total -= Number(t.amount);
      map.set(t.id, total);
    }
    return map;
  }, [visible]);

  if (isLoading) return <div className="text-muted-c">Loading…</div>;
  if (grouped.length === 0) return <div className="text-muted-c">No transactions.</div>;

  return (
    <div>
      {grouped.map(([label, txns]) => (
        <div key={label}>
          <div className="day-heading">
            <div className="eyebrow">{label}</div>
          </div>
          {txns.map((t) => (
            <div className="txn-row" key={t.id}>
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
                  {t.account?.name || 'Unknown account'}
                  {t.occurredOn && (
                    <>
                      <span className="dot-sep" />
                      <span>{t.occurredOn}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="txn-right">
                <div
                  className="mono"
                  style={{ color: Number(t.amount) < 0 ? 'var(--red)' : 'var(--jade)' }}
                >
                  {money(t.amount)}
                </div>
                <div className="txn-balance">{money(cumulativeById.get(t.id) ?? 0)}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
