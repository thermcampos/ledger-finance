import { parseLocalDate } from './date';

// Chronological order (occurredOn, then id) — the same order
// recomputeAccountBalance uses server-side, so each transaction's
// runningBalance lines up correctly when walked in this order.
export function sortChronologically(transactions) {
  return [...transactions].sort((x, y) => {
    const diff = parseLocalDate(x.occurredOn) - parseLocalDate(y.occurredOn);
    return diff !== 0 ? diff : x.id - y.id;
  });
}

// An account's balance as of a cutoff date: walks chronologically sorted
// transactions and stops before anything dated after the cutoff, so a
// post-dated or repeat/installment occurrence scheduled ahead never leaks
// into the total. Falls back to openingBalance when nothing is on-or-before
// the cutoff yet. `sortedTransactions` must already be in the order
// sortChronologically produces — callers that walk the same account's
// transactions at multiple cutoffs (e.g. one per day group) should sort
// once and reuse it, rather than re-sorting on every call.
export function balanceAsOf(account, sortedTransactions, cutoffDate) {
  let balance = Number(account.openingBalance ?? 0);
  for (const t of sortedTransactions) {
    if (parseLocalDate(t.occurredOn) > cutoffDate) break;
    balance = Number(t.runningBalance);
  }
  return balance;
}
