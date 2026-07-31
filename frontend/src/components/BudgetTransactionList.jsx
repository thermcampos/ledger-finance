import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BudgetsApi } from '../api/ledger';
import { parseLocalDate } from '../utils/date';

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

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of data) {
      const label = dayLabel(t.occurredOn);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }
    return Array.from(map.entries());
  }, [data]);

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
                {t.runningBalance != null && (
                  <div className="txn-balance">{money(t.runningBalance)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
