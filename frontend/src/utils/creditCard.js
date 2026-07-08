import { nextDueDate, parseLocalDate, startOfDay } from './date';

// The due date a single transaction is billed to: the stored override if
// present, otherwise the natural rollover from its occurredOn.
export function billDueDateFor(account, txn) {
  if (txn.billDueDate) return parseLocalDate(txn.billDueDate);
  return nextDueDate(account.dueDayOfMonth, parseLocalDate(txn.occurredOn));
}

// Groups a CREDIT_CARD account's transactions into bills by due date, ascending.
export function groupTransactionsByBill(account, transactions) {
  if (account.kind !== 'CREDIT_CARD' || account.dueDayOfMonth == null) return [];
  const groups = new Map();
  for (const t of transactions) {
    const dueDate = billDueDateFor(account, t);
    const key = dueDate.getTime();
    if (!groups.has(key)) groups.set(key, { account, dueDate, total: 0 });
    groups.get(key).total += Number(t.amount);
  }
  return Array.from(groups.values()).sort((a, b) => a.dueDate - b.dueDate);
}

// The next bill due (>= today): { dueDate, amountOwed }. Falls back to a
// zero-amount bill on the natural next due date for a card with no activity yet.
export function nextBillFor(account, transactions, today = new Date()) {
  if (account.kind !== 'CREDIT_CARD' || account.dueDayOfMonth == null) return null;
  const cutoff = startOfDay(today);
  const upcoming = groupTransactionsByBill(account, transactions).find((g) => g.dueDate >= cutoff);
  if (upcoming) return { dueDate: upcoming.dueDate, amountOwed: -upcoming.total };
  return { dueDate: nextDueDate(account.dueDayOfMonth, today), amountOwed: 0 };
}
