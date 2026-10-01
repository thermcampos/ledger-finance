import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BudgetsApi, CategoriesApi } from '../api/ledger';
import { iconClassName } from '../constants/categoryIcons';
import { localYearMonth, parseLocalDate } from '../utils/date';
import { useStickyHeader } from '../hooks/useStickyHeader';

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

export default function Report() {
  const { sentinelRef, progress, isStuck } = useStickyHeader();
  const [monthOffset, setMonthOffset] = useState(0);
  const [categoryId, setCategoryId] = useState('');

  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: CategoriesApi.list });
  const categories = [...(categoriesQuery.data || [])].sort((a, b) => a.name.localeCompare(b.name));

  const { start } = monthBounds(monthOffset);
  const yearMonth = localYearMonth(start);
  const monthLabel = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const reportQuery = useQuery({
    queryKey: ['report-transactions', yearMonth, categoryId],
    queryFn: () => BudgetsApi.transactionsForBudget(yearMonth, categoryId),
    enabled: categoryId !== '',
  });

  // Projected rows (card bills, budget projections) are not real activity —
  // the endpoint already excludes linkedBudget rows; belt-and-braces here.
  const rows = useMemo(
    () => (reportQuery.data || []).filter((t) => !t.linkedCard && !t.linkedBudget),
    [reportQuery.data]
  );

  const total = rows.reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = rows.reduce((sum, t) => sum + (Number(t.amount) < 0 ? -Number(t.amount) : 0), 0);
  const income = rows.reduce((sum, t) => sum + (Number(t.amount) > 0 ? Number(t.amount) : 0), 0);

  const grouped = useMemo(() => {
    const byDay = new Map();
    for (const t of rows) {
      if (!byDay.has(t.occurredOn)) byDay.set(t.occurredOn, []);
      byDay.get(t.occurredOn).push(t);
    }
    return [...byDay.entries()].map(([dateStr, items]) => [dayLabel(dateStr), items]);
  }, [rows]);

  const selectedCategory = categories.find((c) => String(c.id) === categoryId);
  const isLoading = categoryId !== '' && reportQuery.isLoading;

  return (
    <div>
      <div ref={sentinelRef} />
      <div
        className={`sticky-page-header${isStuck ? ' is-stuck' : ''}`}
        style={{ '--header-scale': progress }}
      >
        <div className="page-header">
          <div>
            <div className="eyebrow mb-1">{monthLabel}</div>
            <div className="page-title">Report</div>
          </div>
        </div>
      </div>

      <div className="nav-toolbar">
        <select
          className="form-select form-select-lg"
          style={{ width: 'auto', minWidth: 220 }}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            title="Previous month"
            onClick={() => setMonthOffset((o) => o - 1)}
          >
            <i className="bi bi-chevron-left" />
          </button>
          <div className="mono" style={{ minWidth: 90, textAlign: 'center', fontSize: 15 }}>
            {monthLabel}
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            title="Next month"
            onClick={() => setMonthOffset((o) => o + 1)}
          >
            <i className="bi bi-chevron-right" />
          </button>
        </div>
      </div>

      <div className="panel p-4 mb-4">
        {selectedCategory ? (
          <div className="row align-items-end g-3">
            <div className="col-md-5">
              <div className="eyebrow mb-2">Total · {selectedCategory.name}</div>
              <div
                className="hero-balance md"
                style={{ color: total < 0 ? 'var(--red)' : total > 0 ? 'var(--jade)' : undefined }}
              >
                {money(total)}
              </div>
            </div>
            <div className="col-md-7">
              <div className="row g-3 text-center text-md-start">
                <div className="col-4">
                  <div className="eyebrow mb-1">Transactions</div>
                  <div className="mono" style={{ fontSize: 16 }}>
                    {rows.length}
                  </div>
                </div>
                <div className="col-4">
                  <div className="eyebrow mb-1">Expenses</div>
                  <div className="mono" style={{ fontSize: 16, color: 'var(--red)' }}>
                    {money(expenses)}
                  </div>
                </div>
                <div className="col-4">
                  <div className="eyebrow mb-1">Income</div>
                  <div className="mono" style={{ fontSize: 16, color: 'var(--jade)' }}>
                    {money(income)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-c" style={{ fontSize: 13 }}>
            Select a category to see its total for {monthLabel}.
          </div>
        )}
      </div>

      {isLoading && <div className="text-muted-c">Loading…</div>}

      {reportQuery.isError && (
        <div className="panel p-4" style={{ fontSize: 13, color: 'var(--red)' }}>
          Could not load transactions for this category.
        </div>
      )}

      {!isLoading && !reportQuery.isError && selectedCategory && rows.length === 0 && (
        <div className="panel p-4 text-muted-c" style={{ fontSize: 13 }}>
          No transactions for {selectedCategory.name} in {monthLabel}.
        </div>
      )}

      {grouped.map(([label, items]) => {
        const daySum = items.reduce((sum, t) => sum + Number(t.amount), 0);
        const kind = dayLabelKind(items[0].occurredOn);
        return (
          <div key={label} className="mb-1">
            <div className={`day-heading ${kind}`}>
              <div className="eyebrow">{label}</div>
              <div className="day-total" style={{ color: daySum < 0 ? 'var(--red)' : undefined }}>
                {money(daySum)}
              </div>
            </div>
            {items.map((t) => {
              const rowKind = dayLabelKind(t.occurredOn);
              const color = t.category?.colorHex || 'var(--text-muted)';
              return (
                <div className={`txn-row ${rowKind}`} key={t.id}>
                  <div className="txn-body">
                    <div className="txn-icon" style={{ color }}>
                      <i className={iconClassName(t.category?.icon)} />
                    </div>
                    <div className="txn-main">
                      <div className="txn-desc">
                        <span className="txn-desc-text">{t.description}</span>
                        {rowKind === 'future' && (
                          <span className="tag" style={{ color: 'var(--jade)', borderColor: 'var(--jade)' }}>
                            Upcoming
                          </span>
                        )}
                        {t.seriesInfo && <span className="tag">{t.seriesInfo}</span>}
                        {t.completed && (
                          <span title="Completed">
                            <i
                              className="bi bi-check-circle-fill"
                              style={{ color: 'var(--jade)', fontSize: 14 }}
                            />
                          </span>
                        )}
                        {t.debitAuthorized && (
                          <span title="Debit authorized">
                            <i
                              className="bi bi-shield-check"
                              style={{ color: 'var(--gold)', fontSize: 14 }}
                            />
                          </span>
                        )}
                      </div>
                      <div className="txn-meta">
                        <span className="txn-meta-cat">{t.category?.name || 'Uncategorized'}</span>
                        <span className="dot-sep" />
                        <span className="txn-meta-value">{t.account?.name || 'Account'}</span>
                      </div>
                    </div>
                    <div className="txn-right">
                      <div className={`cell-amount ${t.amount < 0 ? 'neg' : 'pos'}`}>
                        {money(Number(t.amount), { signed: true })}
                      </div>
                    </div>
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
