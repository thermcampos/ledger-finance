import { describe, expect, it } from 'vitest';
import { buildReportMarkdown } from './reportExport';

const txn = (id, occurredOn, description, amount, extra = {}) => ({
  id,
  occurredOn,
  description,
  amount,
  account: { name: 'Checking' },
  ...extra,
});

function report(overrides = {}) {
  return {
    yearMonth: '2026-11',
    monthLabel: 'Nov 2026',
    prevMonthLabel: 'Oct',
    today: '2026-11-03',
    includeUpcoming: false,
    totalSpent: 200,
    income: 30,
    prevSpent: 160,
    ranked: [
      { categoryId: 1, categoryName: 'Groceries', spent: 150 },
      { categoryId: 2, categoryName: 'Dining', spent: 50 },
    ],
    refunds: [{ categoryId: 3, categoryName: 'Refunds', spent: -30 }],
    internal: [{ categoryId: 9, categoryName: 'Card payment', spent: 900 }],
    transactionsByCategory: new Map([
      [1, [txn(12, '2026-11-02', 'Market', -100), txn(11, '2026-11-01', 'Bakery | café', -50)]],
      [2, [txn(21, '2026-11-02', 'Lunch', -50, { seriesInfo: '2/3', seriesRepeat: 'INSTALLMENTS' })]],
      [3, [txn(31, '2026-11-01', 'Return', 30)]],
      [9, [txn(91, '2026-11-01', 'Credit card payment — Visa', -900)]],
    ]),
    ...overrides,
  };
}

describe('buildReportMarkdown', () => {
  const md = buildReportMarkdown(report());

  it('summarises totals, net and change vs previous month', () => {
    expect(md).toContain('| Total spent | 200.00 |');
    expect(md).toContain('| Net (income − spent) | -170.00 |');
    expect(md).toContain('| Change vs Oct | +40.00 (25.0%) |');
  });

  it('ranks categories with shares and a total row', () => {
    expect(md).toContain('| 1 | Groceries | 150.00 | 75.0% | 2 |');
    expect(md).toContain('| 2 | Dining | 50.00 | 25.0% | 1 |');
    expect(md).toContain('|  | **Total** | **200.00** | **100.0%** |  |');
  });

  it('lists internal categories apart, flagged as not counted', () => {
    expect(md).toContain('## Internal categories (not counted in spending)');
    expect(md).toContain('| Card payment | -900.00 |');
    expect(md).toContain('### Card payment — internal — not counted in spending');
  });

  it('lists transactions chronologically with signed amounts, notes and subtotals', () => {
    const groceries = md.slice(md.indexOf('### Groceries'), md.indexOf('### Dining'));
    expect(groceries.indexOf('Bakery')).toBeLessThan(groceries.indexOf('Market'));
    expect(groceries).toContain('| 2026-11-01 | Bakery \\| café | Checking | -50.00 |  |');
    expect(groceries).toContain('2 transactions · expenses 150.00 · income 0.00 · net -150.00');
    expect(md).toContain('| Lunch | Checking | -50.00 | installment 2/3 |');
    expect(md).toContain('| Return | Checking | +30.00 |  |');
  });

  it('labels series rows by their repeat kind, not always as installments', () => {
    const notesFor = (extra) =>
      buildReportMarkdown(
        report({
          transactionsByCategory: new Map([[2, [txn(21, '2026-11-02', 'Lunch', -50, extra)]]]),
        }),
      );
    expect(notesFor({ seriesInfo: '2/3', seriesRepeat: 'MONTHLY' })).toContain('| -50.00 | monthly 2/3 |');
    expect(notesFor({ seriesInfo: '2/3', seriesRepeat: 'WEEKLY' })).toContain('| -50.00 | weekly 2/3 |');
    expect(notesFor({ seriesInfo: '2/3', seriesRepeat: 'YEARLY' })).toContain('| -50.00 | yearly 2/3 |');
    expect(notesFor({ seriesInfo: '2/3', seriesRepeat: null })).toContain('| -50.00 | series 2/3 |');
  });

  it('lists the card installments it is given, with a total, without touching Total spent', () => {
    const withSeries = buildReportMarkdown(
      report({
        installments: [
          txn(41, '2026-10-28', 'TV', -200, { seriesInfo: '3/10', account: { name: 'Visa' } }),
          txn(42, '2026-11-02', 'Phone', -50, { seriesInfo: '2/3', account: { name: 'Visa' } }),
        ],
      })
    );
    const section = withSeries.slice(
      withSeries.indexOf('## Credit card installments'),
      withSeries.indexOf('## Transactions')
    );
    expect(section).toContain('| Date | Description | Account | Installment | Amount |');
    expect(section).toContain('| 2026-10-28 | TV | Visa | 3/10 | -200.00 |');
    expect(section).toContain('| 2026-11-02 | Phone | Visa | 2/3 | -50.00 |');
    expect(section).toContain('2 installments · total -250.00');
    expect(withSeries).toContain('| Total spent | 200.00 |');
  });

  it('omits the installments section when there are none', () => {
    expect(buildReportMarkdown(report())).not.toContain('## Credit card installments');
  });

  it('marks the change vs previous month n/a when there was no prior spend', () => {
    const empty = buildReportMarkdown(report({ prevSpent: 0 }));
    expect(empty).toContain('| Change vs Oct | n/a |');
  });
});
