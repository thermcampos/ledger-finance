import { describe, expect, it } from 'vitest';
import { amountMatchesSearch, matchesTransactionSearch } from './search';

describe('amountMatchesSearch', () => {
  it('matches the rendered two-decimal form even when JSON dropped trailing zeros', () => {
    expect(amountMatchesSearch(-11, '11.00')).toBe(true);
    expect(amountMatchesSearch(-11, '11.0')).toBe(true);
    expect(amountMatchesSearch(-11, '11')).toBe(true);
  });

  it('accepts comma as decimal separator', () => {
    expect(amountMatchesSearch(-11, '11,00')).toBe(true);
    expect(amountMatchesSearch(-11, '11,0')).toBe(true);
    expect(amountMatchesSearch(-1234.5, '1234,50')).toBe(true);
  });

  it('matches thousands-grouped rendering', () => {
    expect(amountMatchesSearch(-1234.5, '1,234.50')).toBe(true);
    expect(amountMatchesSearch(-1234.5, '1234.50')).toBe(true);
  });

  it('ignores sign and currency symbol in the term', () => {
    expect(amountMatchesSearch(-11, '-$11.00')).toBe(true);
    expect(amountMatchesSearch(-11, '$11')).toBe(true);
  });

  it('rejects amounts with different digits', () => {
    expect(amountMatchesSearch(-11, '11.5')).toBe(false);
    expect(amountMatchesSearch(-11, '12')).toBe(false);
    expect(amountMatchesSearch(-11, '2')).toBe(false);
  });

  it('does not digit-match non-numeric terms', () => {
    expect(amountMatchesSearch(-11, 'groceries 11')).toBe(false);
    expect(amountMatchesSearch(-11, 'abc')).toBe(false);
  });
});

describe('matchesTransactionSearch', () => {
  const txn = {
    description: 'Grocery run',
    amount: -11,
    category: { name: 'Groceries' },
  };

  it('matches an empty term', () => {
    expect(matchesTransactionSearch(txn, '')).toBe(true);
    expect(matchesTransactionSearch(txn, '   ')).toBe(true);
  });

  it('matches description and category case-insensitively', () => {
    expect(matchesTransactionSearch(txn, 'GROCERY')).toBe(true);
    expect(matchesTransactionSearch(txn, 'groceries')).toBe(true);
  });

  it('matches the amount', () => {
    expect(matchesTransactionSearch(txn, '11.00')).toBe(true);
    expect(matchesTransactionSearch(txn, '11,00')).toBe(true);
  });

  it('handles a missing category', () => {
    expect(matchesTransactionSearch({ ...txn, category: null }, 'groceries')).toBe(false);
    expect(matchesTransactionSearch({ ...txn, category: null }, '11')).toBe(true);
  });

  it('rejects unrelated terms', () => {
    expect(matchesTransactionSearch(txn, 'rent')).toBe(false);
  });
});
