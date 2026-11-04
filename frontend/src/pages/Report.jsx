import { useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { BudgetsApi, CategoriesApi } from '../api/ledger';
import { iconClassName } from '../constants/categoryIcons';
import { isoDate, localYearMonth, parseLocalDate } from '../utils/date';
import { useStickyHeader } from '../hooks/useStickyHeader';
import { downloadFile } from '../utils/export';
import { buildReportMarkdown } from '../utils/reportExport';
import { installmentRows, installmentsTotal } from '../utils/reportInstallments';

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

const TOP_LIST = 10;
const TOP_BAR = 5;

function percent(value) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Ranks the spend endpoint's per-category totals. Categories that net to a
// refund/income (spent <= 0) aren't spending, so they're left out of the
// ranking; transfers net to zero across their two sides and drop out here too.
// Internal categories (e.g. "Card payment") mirror spend already counted
// elsewhere, so they're never part of the ranking or the totals.
function rankSpend(spend, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return spend
    .filter((s) => !s.internal)
    .map((s) => ({ ...s, spent: Number(s.spent), category: byId.get(s.categoryId) }))
    .filter((s) => s.spent > 0)
    .sort((a, b) => b.spent - a.spent);
}

// Real, already-happened (or upcoming, when toggled) rows of a drill-down list.
function visibleRows(data, includeUpcoming, today) {
  return (data || []).filter(
    (t) => !t.linkedCard && !t.linkedBudget && (includeUpcoming || t.occurredOn <= today)
  );
}

// Non-internal categories netting to money in (or zero) — left out of the
// ranking but still part of the month, so the export lists them.
function refundSpend(spend) {
  return spend
    .filter((s) => !s.internal)
    .map((s) => ({ ...s, spent: Number(s.spent) }))
    .filter((s) => s.spent <= 0)
    .sort((a, b) => a.spent - b.spent);
}

// Internal categories, listed apart for visibility only — not counted anywhere.
function internalSpend(spend, categories) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return spend
    .filter((s) => s.internal)
    .map((s) => ({ ...s, spent: Number(s.spent), category: byId.get(s.categoryId) }))
    .filter((s) => s.spent !== 0)
    .sort((a, b) => b.spent - a.spent);
}

export default function Report() {
  const { sentinelRef, progress, isStuck } = useStickyHeader();
  const queryClient = useQueryClient();
  const [exportState, setExportState] = useState('idle'); // idle | busy | error
  const [monthOffset, setMonthOffset] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [includeUpcoming, setIncludeUpcoming] = useState(false);

  // Internal categories included: the report lists them in their own group.
  const categoriesQuery = useQuery({
    queryKey: ['categories', { includeInternal: true }],
    queryFn: () => CategoriesApi.list({ includeInternal: true }),
  });
  const categories = useMemo(() => categoriesQuery.data || [], [categoriesQuery.data]);
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );
  const [showAll, setShowAll] = useState(false);

  const { start } = monthBounds(monthOffset);
  const yearMonth = localYearMonth(start);
  const monthLabel = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const { start: prevStart } = monthBounds(monthOffset - 1);
  const prevYearMonth = localYearMonth(prevStart);
  const prevMonthLabel = prevStart.toLocaleDateString('en-US', { month: 'short' });

  // Keyed under 'budgets-spend' so the invalidations Budgets/Transactions
  // already fire on writes refresh the report too.
  const spendQuery = useQuery({
    queryKey: ['budgets-spend', yearMonth, { includeUpcoming, includeInternal: true }],
    queryFn: () => BudgetsApi.spendForMonth(yearMonth, { includeUpcoming, includeInternal: true }),
  });
  const prevSpendQuery = useQuery({
    queryKey: ['budgets-spend', prevYearMonth, { includeUpcoming, includeInternal: true }],
    queryFn: () => BudgetsApi.spendForMonth(prevYearMonth, { includeUpcoming, includeInternal: true }),
  });

  const ranked = useMemo(
    () => rankSpend(spendQuery.data || [], categories),
    [spendQuery.data, categories]
  );
  const internalRows = useMemo(
    () => internalSpend(spendQuery.data || [], categories),
    [spendQuery.data, categories]
  );
  const refunds = useMemo(() => refundSpend(spendQuery.data || []), [spendQuery.data]);
  const totalSpent = ranked.reduce((sum, s) => sum + s.spent, 0);
  const income = (spendQuery.data || [])
    .filter((s) => !s.internal)
    .reduce((sum, s) => sum + (Number(s.spent) < 0 ? -Number(s.spent) : 0), 0);
  const prevSpent = rankSpend(prevSpendQuery.data || [], categories).reduce(
    (sum, s) => sum + s.spent,
    0
  );
  const spentDelta = totalSpent - prevSpent;

  const topList = showAll ? ranked : ranked.slice(0, TOP_LIST);
  const topBar = ranked.slice(0, TOP_BAR);
  const otherSpent = totalSpent - topBar.reduce((sum, s) => sum + s.spent, 0);
  const share = (amount) => (totalSpent > 0 ? (amount / totalSpent) * 100 : 0);

  const reportQuery = useQuery({
    queryKey: ['report-transactions', yearMonth, categoryId],
    queryFn: () => BudgetsApi.transactionsForBudget(yearMonth, categoryId),
    enabled: categoryId !== '',
  });

  // Projected rows (card bills, budget projections) are not real activity —
  // the endpoint already excludes linkedBudget rows; belt-and-braces here.
  // Upcoming rows are dropped unless the toggle is on, so the drill-down
  // total matches the ranking above.
  const today = isoDate(new Date());
  const rows = useMemo(
    () => visibleRows(reportQuery.data, includeUpcoming, today),
    [reportQuery.data, includeUpcoming, today]
  );

  // Installments follow-up: every non-internal category's transactions,
  // through the drill-down's query key (shared cache with it and the export),
  // narrowed to installment rows. Read-only — never added to the totals.
  const installmentLists = useQueries({
    queries: [...ranked, ...refunds].map((s) => ({
      queryKey: ['report-transactions', yearMonth, String(s.categoryId)],
      queryFn: () => BudgetsApi.transactionsForBudget(yearMonth, String(s.categoryId)),
    })),
    combine: (results) => results.map((r) => r.data),
  });
  const installments = useMemo(
    () => installmentRows(installmentLists.map((list) => visibleRows(list, includeUpcoming, today))),
    [installmentLists, includeUpcoming, today]
  );
  const installmentsSum = installmentsTotal(installments);

  // Markdown export of the whole month — every category's transactions,
  // fetched through the drill-down's query key so they're cached for it too.
  const exportReport = async () => {
    setExportState('busy');
    try {
      const all = [...ranked, ...refunds, ...internalRows];
      const lists = await Promise.all(
        all.map((s) =>
          queryClient.fetchQuery({
            queryKey: ['report-transactions', yearMonth, String(s.categoryId)],
            queryFn: () => BudgetsApi.transactionsForBudget(yearMonth, String(s.categoryId)),
          })
        )
      );
      const transactionsByCategory = new Map(
        all.map((s, i) => [s.categoryId, visibleRows(lists[i], includeUpcoming, today)])
      );
      const markdown = buildReportMarkdown({
        yearMonth,
        monthLabel,
        prevMonthLabel,
        today,
        includeUpcoming,
        totalSpent,
        income,
        prevSpent,
        ranked,
        refunds,
        internal: internalRows,
        transactionsByCategory,
      });
      downloadFile(markdown, `ledger-report-${yearMonth}.md`, 'text/markdown;charset=utf-8;');
      setExportState('idle');
    } catch {
      setExportState('error');
    }
  };

  const total = rows.reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = rows.reduce((sum, t) => sum + (Number(t.amount) < 0 ? -Number(t.amount) : 0), 0);
  const drillIncome = rows.reduce((sum, t) => sum + (Number(t.amount) > 0 ? Number(t.amount) : 0), 0);

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
  const toggleCategory = (id) => setCategoryId((current) => (current === String(id) ? '' : String(id)));

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
          <div className="d-flex align-items-center gap-2">
            {exportState === 'error' && (
              <span style={{ fontSize: 12.5, color: 'var(--red)' }}>Export failed</span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Download this month as Markdown — all transactions, totals and shares"
              disabled={exportState === 'busy' || spendQuery.isLoading || spendQuery.isError}
              onClick={exportReport}
            >
              <i className="bi bi-download me-1" />
              {exportState === 'busy' ? 'Exporting…' : 'Export'}
            </button>
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
          <option value="">All categories</option>
          {sortedCategories.map((c) => (
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

        <label className="eyebrow d-flex align-items-center gap-2 mb-0">
          <input
            type="checkbox"
            checked={includeUpcoming}
            onChange={(e) => setIncludeUpcoming(e.target.checked)}
          />
          Include upcoming
        </label>
      </div>

      <div className="panel p-4 mb-4">
        <div className="row align-items-end g-3">
          <div className="col-md-5">
            <div className="eyebrow mb-2">
              Spent · {monthLabel}
              {!includeUpcoming && ' · to date'}
            </div>
            <div className="hero-balance md">{money(totalSpent)}</div>
          </div>
          <div className="col-md-7">
            <div className="row g-3 text-center text-md-start">
              <div className="col-4">
                <div className="eyebrow mb-1">Income</div>
                <div className="mono" style={{ fontSize: 16, color: 'var(--jade)' }}>
                  {money(income)}
                </div>
              </div>
              <div className="col-4">
                <div className="eyebrow mb-1">Net</div>
                <div
                  className="mono"
                  style={{ fontSize: 16, color: income - totalSpent < 0 ? 'var(--red)' : 'var(--jade)' }}
                >
                  {money(income - totalSpent, { signed: true })}
                </div>
              </div>
              <div className="col-4">
                <div className="eyebrow mb-1">vs {prevMonthLabel}</div>
                <div
                  className="mono"
                  style={{ fontSize: 16, color: spentDelta > 0 ? 'var(--red)' : spentDelta < 0 ? 'var(--jade)' : undefined }}
                >
                  {prevSpent > 0 ? money(spentDelta, { signed: true }) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {spendQuery.isLoading && <div className="text-muted-c mb-4">Loading…</div>}

      {spendQuery.isError && (
        <div className="panel p-4 mb-4" style={{ fontSize: 13, color: 'var(--red)' }}>
          Could not load spending for {monthLabel}.
        </div>
      )}

      {!spendQuery.isLoading && !spendQuery.isError && ranked.length === 0 && (
        <div className="panel p-4 mb-4 text-muted-c" style={{ fontSize: 13 }}>
          No spending recorded for {monthLabel}
          {!includeUpcoming && ' so far'}.
        </div>
      )}

      {ranked.length > 0 && (
        <div className="panel p-4 mb-4">
          <div className="eyebrow mb-3">Top {Math.min(TOP_BAR, ranked.length)} · share of spending</div>
          <div className="share-bar mb-3">
            {topBar.map((s) => (
              <div
                key={s.categoryId}
                className="share-seg"
                title={`${s.categoryName} · ${percent(share(s.spent))}`}
                style={{ width: `${share(s.spent)}%`, background: s.category?.colorHex || 'var(--text-muted)' }}
              />
            ))}
            {otherSpent > 0 && (
              <div
                className="share-seg"
                title={`Other · ${percent(share(otherSpent))}`}
                style={{ width: `${share(otherSpent)}%`, background: 'var(--text-faint)' }}
              />
            )}
          </div>
          <div className="share-legend">
            {topBar.map((s) => (
              <div className="share-legend-item" key={s.categoryId}>
                <span className="share-swatch" style={{ background: s.category?.colorHex || 'var(--text-muted)' }} />
                <span className="share-legend-name">{s.categoryName}</span>
                <span className="mono">{percent(share(s.spent))}</span>
              </div>
            ))}
            {otherSpent > 0 && (
              <div className="share-legend-item">
                <span className="share-swatch" style={{ background: 'var(--text-faint)' }} />
                <span className="share-legend-name">Other</span>
                <span className="mono">{percent(share(otherSpent))}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {topList.length > 0 && (
        <div className="panel p-4 mb-4">
          <div className="eyebrow mb-3">
            {showAll ? `All ${ranked.length}` : `Top ${topList.length}`} categories
          </div>
          {topList.map((s, i) => {
            const color = s.category?.colorHex || 'var(--text-muted)';
            const selected = categoryId === String(s.categoryId);
            return (
              <button
                type="button"
                key={s.categoryId}
                className={`rank-row${selected ? ' selected' : ''}`}
                onClick={() => toggleCategory(s.categoryId)}
              >
                <span className="rank-num mono">{i + 1}</span>
                <span className="txn-icon" style={{ color, width: 28, height: 28, fontSize: 13 }}>
                  <i className={iconClassName(s.category?.icon)} />
                </span>
                <span className="rank-main">
                  <span className="spend-label">
                    <span>{s.categoryName}</span>
                    <span className="rank-figures mono">
                      <span className="text-faint">{percent(share(s.spent))}</span>
                      <span>{money(s.spent)}</span>
                    </span>
                  </span>
                  <span className="track d-block">
                    <span className="track-fill d-block" style={{ width: `${share(s.spent)}%`, background: color }} />
                  </span>
                </span>
              </button>
            );
          })}
          {ranked.length > TOP_LIST && (
            <div className="text-center mt-3">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? `Show top ${TOP_LIST}` : `Show all ${ranked.length}`}
              </button>
            </div>
          )}
        </div>
      )}

      {internalRows.length > 0 && (
        <div className="panel p-4 mb-4">
          <div className="eyebrow mb-1">Internal · not counted in spending</div>
          <div className="text-muted-c mb-3" style={{ fontSize: 12.5 }}>
            Money moved between your own accounts — already counted where it was spent.
          </div>
          {internalRows.map((s) => {
            const color = s.category?.colorHex || 'var(--text-muted)';
            const selected = categoryId === String(s.categoryId);
            return (
              <button
                type="button"
                key={s.categoryId}
                className={`rank-row${selected ? ' selected' : ''}`}
                onClick={() => toggleCategory(s.categoryId)}
              >
                <span className="txn-icon" style={{ color, width: 28, height: 28, fontSize: 13 }}>
                  <i className={iconClassName(s.category?.icon)} />
                </span>
                <span className="rank-main">
                  <span className="spend-label">
                    <span className="text-muted-c">{s.categoryName}</span>
                    <span className="rank-figures mono">
                      <span className="text-muted-c">{money(s.spent)}</span>
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {installments.length > 0 && (
        <div className="panel p-4 mb-4">
          <div className="eyebrow mb-1">Installments · {monthLabel}</div>
          <div className="text-muted-c mb-3" style={{ fontSize: 12.5 }}>
            For follow-up only — already counted in the spending above.
          </div>
          {installments.map((t) => (
            <div className="installment-row" key={t.id}>
              <div className="installment-main">
                <div className="txn-desc">
                  <span className="txn-desc-text">{t.description}</span>
                  <span className="tag mono">{t.seriesInfo}</span>
                </div>
                <div className="txn-meta">
                  <span className="txn-meta-value">
                    {parseLocalDate(t.occurredOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="dot-sep" />
                  <span className="txn-meta-value">{t.account?.name || 'Account'}</span>
                </div>
              </div>
              <div className={`cell-amount ${Number(t.amount) < 0 ? 'neg' : 'pos'}`}>
                {money(Number(t.amount), { signed: true })}
              </div>
            </div>
          ))}
          <div className="installment-total">
            <span className="eyebrow">
              Total · {installments.length} installment{installments.length === 1 ? '' : 's'}
            </span>
            <span className={`cell-amount ${installmentsSum < 0 ? 'neg' : 'pos'}`}>
              {money(installmentsSum, { signed: true })}
            </span>
          </div>
        </div>
      )}

      {selectedCategory && (
        <div className="panel p-4 mb-4">
          <div className="row align-items-end g-3">
            <div className="col-md-5">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="eyebrow">Total · {selectedCategory.name}</div>
              </div>
              <div
                className="mono"
                style={{ fontSize: 22, color: total < 0 ? 'var(--red)' : total > 0 ? 'var(--jade)' : undefined }}
              >
                {money(total)}
              </div>
            </div>
            <div className="col-md-7">
              <div className="row g-3 text-center text-md-start align-items-end">
                <div className="col-3">
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
                    {money(drillIncome)}
                  </div>
                </div>
                <div className="col-1 text-end">
                  <button
                    type="button"
                    className="icon-btn"
                    title="Close"
                    onClick={() => setCategoryId('')}
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
