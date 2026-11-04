import { describe, expect, it } from 'vitest';
import { installmentRows, installmentsTotal } from './reportInstallments';

const txn = (id, occurredOn, amount, seriesRepeat, seriesInfo = '1/3') => ({
  id,
  occurredOn,
  amount,
  seriesRepeat,
  seriesInfo: seriesRepeat ? seriesInfo : null,
});

describe('installmentRows', () => {
  it('keeps only installments, skipping recurring and one-off rows', () => {
    const rows = installmentRows([
      [txn(1, '2026-11-05', -100, 'INSTALLMENTS'), txn(2, '2026-11-05', -30, 'MONTHLY')],
      [txn(3, '2026-11-02', -10, 'WEEKLY'), txn(4, '2026-11-03', -5, 'YEARLY'), txn(5, '2026-11-04', -7, null)],
    ]);
    expect(rows.map((t) => t.id)).toEqual([1]);
  });

  it('merges categories and sorts by date, then id', () => {
    const rows = installmentRows([
      [txn(9, '2026-11-10', -1, 'INSTALLMENTS'), txn(4, '2026-11-02', -1, 'INSTALLMENTS')],
      undefined,
      [txn(3, '2026-11-10', -1, 'INSTALLMENTS')],
    ]);
    expect(rows.map((t) => t.id)).toEqual([4, 3, 9]);
  });
});

describe('installmentsTotal', () => {
  it('sums signed amounts, including string decimals from the API', () => {
    expect(installmentsTotal([{ amount: '-33.34' }, { amount: -33.33 }])).toBeCloseTo(-66.67);
    expect(installmentsTotal([])).toBe(0);
  });
});
