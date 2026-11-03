// Builds the Report page's Markdown export: summary, category ranking with
// shares, internal categories and every transaction behind those figures.
// Meant to be pasted into an LLM, so it states its own conventions up front.

function amount(value, { signed = false } = {}) {
  const abs = Math.abs(value).toFixed(2);
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  return `${sign}${abs}`;
}

function percent(value) {
  return `${value.toFixed(1)}%`;
}

// Pipes and newlines would break a Markdown table row.
function cell(text) {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ');
}

function table(header, rows, align) {
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${align.map((a) => (a === 'r' ? '---:' : '---')).join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function transactionNotes(t, today) {
  const notes = [];
  if (t.occurredOn > today) notes.push('upcoming');
  if (t.seriesInfo) notes.push(`installment ${t.seriesInfo}`);
  if (t.completed) notes.push('completed');
  if (t.debitAuthorized) notes.push('debit authorized');
  return notes.join(', ');
}

/**
 * @param {object} report
 * @param {string} report.yearMonth        e.g. "2026-11"
 * @param {string} report.monthLabel       e.g. "Nov 2026"
 * @param {string} report.prevMonthLabel   e.g. "Oct"
 * @param {string} report.today            ISO date the export was made
 * @param {boolean} report.includeUpcoming
 * @param {number} report.totalSpent
 * @param {number} report.income
 * @param {number} report.prevSpent
 * @param {Array}  report.ranked           spending categories, ranked ({categoryId, categoryName, spent})
 * @param {Array}  report.refunds          non-internal categories netting to income/zero
 * @param {Array}  report.internal         internal categories
 * @param {Map}    report.transactionsByCategory  categoryId → transactions (already filtered)
 */
export function buildReportMarkdown(report) {
  const {
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
    internal,
    transactionsByCategory,
  } = report;
  const share = (value) => (totalSpent > 0 ? (value / totalSpent) * 100 : 0);
  const out = [];

  out.push(`# Spending report — ${monthLabel}`);
  out.push('');
  out.push(
    [
      `- Month: ${yearMonth}${includeUpcoming ? ' (includes upcoming transactions)' : ` (to date, through ${today})`}`,
      `- Exported: ${today}`,
      '- Currency amounts are plain decimals. In transaction tables, negative = money out, positive = money in.',
      '- "Spent" per category = expenses minus refunds in that category. Share = category spent / total spent.',
      '- Internal categories (e.g. credit card bill payments) move money between the user\'s own accounts; they mirror spending already counted elsewhere and are NOT included in totals or shares.',
      '- Projected rows (budget projections, open card bills) and uncategorized transactions are excluded.',
    ].join('\n')
  );
  out.push('');

  out.push('## Summary');
  out.push('');
  out.push(
    table(
      ['Metric', 'Amount'],
      [
        ['Total spent', amount(totalSpent)],
        ['Income', amount(income)],
        ['Net (income − spent)', amount(income - totalSpent, { signed: true })],
        [`Spent in ${prevMonthLabel}`, prevSpent > 0 ? amount(prevSpent) : 'n/a'],
        [
          `Change vs ${prevMonthLabel}`,
          prevSpent > 0
            ? `${amount(totalSpent - prevSpent, { signed: true })} (${percent(((totalSpent - prevSpent) / prevSpent) * 100)})`
            : 'n/a',
        ],
      ],
      ['l', 'r']
    )
  );
  out.push('');

  out.push('## Spending by category');
  out.push('');
  if (ranked.length === 0) {
    out.push('No spending recorded.');
  } else {
    out.push(
      table(
        ['#', 'Category', 'Spent', 'Share', 'Transactions'],
        [
          ...ranked.map((s, i) => [
            i + 1,
            s.categoryName,
            amount(s.spent),
            percent(share(s.spent)),
            (transactionsByCategory.get(s.categoryId) || []).length,
          ]),
          ['', '**Total**', `**${amount(totalSpent)}**`, '**100.0%**', ''],
        ],
        ['r', 'l', 'r', 'r', 'r']
      )
    );
  }
  out.push('');

  if (refunds.length > 0) {
    out.push('## Income and net-refund categories');
    out.push('');
    out.push('Categories whose transactions net to money in (or zero) this month; counted in Income, not in Spent.');
    out.push('');
    out.push(
      table(
        ['Category', 'Net amount'],
        refunds.map((s) => [s.categoryName, amount(-s.spent, { signed: true })]),
        ['l', 'r']
      )
    );
    out.push('');
  }

  if (internal.length > 0) {
    out.push('## Internal categories (not counted in spending)');
    out.push('');
    out.push(
      table(
        ['Category', 'Net amount'],
        internal.map((s) => [s.categoryName, amount(-s.spent, { signed: true })]),
        ['l', 'r']
      )
    );
    out.push('');
  }

  out.push('## Transactions');
  const groups = [
    ...ranked.map((s) => ({ s, label: `${amount(s.spent)} spent · ${percent(share(s.spent))} of total` })),
    ...refunds.map((s) => ({ s, label: 'income / net refund' })),
    ...internal.map((s) => ({ s, label: 'internal — not counted in spending' })),
  ];
  for (const { s, label } of groups) {
    const rows = transactionsByCategory.get(s.categoryId) || [];
    const sorted = [...rows].sort((a, b) =>
      a.occurredOn === b.occurredOn ? a.id - b.id : a.occurredOn < b.occurredOn ? -1 : 1
    );
    const expenses = sorted.reduce((sum, t) => sum + (Number(t.amount) < 0 ? -Number(t.amount) : 0), 0);
    const inflow = sorted.reduce((sum, t) => sum + (Number(t.amount) > 0 ? Number(t.amount) : 0), 0);
    out.push('');
    out.push(`### ${s.categoryName} — ${label}`);
    out.push('');
    if (sorted.length === 0) {
      out.push('No transactions.');
      continue;
    }
    out.push(
      table(
        ['Date', 'Description', 'Account', 'Amount', 'Notes'],
        [
          ...sorted.map((t) => [
            t.occurredOn,
            t.description,
            t.account?.name || '',
            amount(Number(t.amount), { signed: true }),
            transactionNotes(t, today),
          ]),
        ],
        ['l', 'l', 'l', 'r', 'l']
      )
    );
    out.push('');
    out.push(
      `${sorted.length} transaction${sorted.length === 1 ? '' : 's'} · expenses ${amount(expenses)} · income ${amount(inflow)} · net ${amount(inflow - expenses, { signed: true })}`
    );
  }
  out.push('');
  return out.join('\n');
}
