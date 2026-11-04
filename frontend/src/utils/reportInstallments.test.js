import { describe, expect, it } from 'vitest';
import { cardInstallmentRows, installmentsTotal } from './reportInstallments';

const visa = { id: 1, name: 'Visa', kind: 'CREDIT_CARD', dueDayOfMonth: 10 };
const checking = { id: 2, name: 'Checking', kind: 'CHECKING', dueDayOfMonth: null };

const txn = (id, occurredOn, extra = {}) => ({
  id,
  occurredOn,
  amount: -100,
  seriesRepeat: 'INSTALLMENTS',
  seriesInfo: '1/3',
  ...extra,
});

const run = (byCard, opts = {}) =>
  cardInstallmentRows([visa, checking], new Map(byCard), '2026-11', {
    includeUpcoming: true,
    today: '2026-11-15',
    ...opts,
  }).map((t) => t.id);

describe('cardInstallmentRows', () => {
  it('picks rows by the bill they are due on, not their transaction date', () => {
    // Due day 10: Oct 28 → Nov 10 bill; Nov 5 → Nov 10 bill; Nov 20 → Dec 10 bill.
    const ids = run([[1, [txn(1, '2026-10-28'), txn(2, '2026-11-05'), txn(3, '2026-11-20')]]]);
    expect(ids).toEqual([1, 2]);
  });

  it('honours a stored bill override', () => {
    const ids = run([
      [1, [txn(1, '2026-11-05', { billDueDate: '2026-12-10' }), txn(2, '2026-11-20', { billDueDate: '2026-11-10' })]],
    ]);
    expect(ids).toEqual([2]);
  });

  it('skips recurring, one-off, internal, projected and non-card rows', () => {
    const ids = run([
      [
        1,
        [
          txn(1, '2026-11-01'),
          txn(2, '2026-11-01', { seriesRepeat: 'MONTHLY' }),
          txn(3, '2026-11-01', { seriesRepeat: null, seriesInfo: null }),
          txn(4, '2026-11-01', { category: { internal: true } }),
          txn(5, '2026-11-01', { linkedBudget: { id: 9 } }),
        ],
      ],
      [2, [txn(6, '2026-11-01')]],
    ]);
    expect(ids).toEqual([1]);
  });

  it('drops rows dated after today unless upcoming is included', () => {
    const byCard = [[1, [txn(1, '2026-11-01'), txn(2, '2026-11-09')]]];
    expect(run(byCard, { includeUpcoming: false, today: '2026-11-05' })).toEqual([1]);
    expect(run(byCard, { includeUpcoming: true, today: '2026-11-05' })).toEqual([1, 2]);
  });

  it('sorts by date, then id, and fills in the card as account', () => {
    const rows = cardInstallmentRows(
      [visa],
      new Map([[1, [txn(9, '2026-11-03'), txn(4, '2026-10-30'), txn(3, '2026-11-03')]]]),
      '2026-11',
      { includeUpcoming: true, today: '2026-11-30' }
    );
    expect(rows.map((t) => t.id)).toEqual([4, 3, 9]);
    expect(rows[0].account.name).toBe('Visa');
  });
});

describe('installmentsTotal', () => {
  it('sums signed amounts, including string decimals from the API', () => {
    expect(installmentsTotal([{ amount: '-33.34' }, { amount: -33.33 }])).toBeCloseTo(-66.67);
    expect(installmentsTotal([])).toBe(0);
  });
});
