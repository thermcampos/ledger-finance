import { nextDueDate, parseLocalDate, startOfDay, isoDate } from './date';

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

// The next 3 upcoming bills relative to occurredOn, for a "Bill" dropdown —
// lets a purchase made right before a statement closes be pinned to next
// month's bill instead of the one occurredOn would naturally roll into.
export function billOptionsFor(account, occurredOnStr) {
  if (!account?.dueDayOfMonth) return [];
  const first = nextDueDate(account.dueDayOfMonth, parseLocalDate(occurredOnStr));
  const second = nextDueDate(account.dueDayOfMonth, new Date(first.getFullYear(), first.getMonth() + 1, 1));
  const third = nextDueDate(account.dueDayOfMonth, new Date(second.getFullYear(), second.getMonth() + 1, 1));
  return [first, second, third];
}

// Same as billOptionsFor, but ensures the currently-assigned bill stays a
// selectable option even if it no longer matches the 3 natural upcoming ones.
export function billOptionsWithCurrent(account, occurredOnStr, currentIso) {
  const options = billOptionsFor(account, occurredOnStr);
  if (currentIso && !options.some((d) => isoDate(d) === currentIso)) {
    options.push(parseLocalDate(currentIso));
    options.sort((a, b) => a - b);
  }
  return options;
}
