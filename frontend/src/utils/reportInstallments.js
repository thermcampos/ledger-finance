import { billDueDateFor } from './creditCard';
import { localYearMonth } from './date';

// The Report page's "Card installments" follow-up list: installment rows
// (recurring weekly/monthly/yearly series are skipped) on each credit card's
// bill due in the report month — the same bill assignment as Card Bills, so
// a purchase dated Oct 28 on the Nov 10 bill belongs to November.
// Read-only — these rows are already counted in their categories' spending
// (by transaction date), so the total here is never added to the report's totals.

/**
 * @param {Array} cards                   accounts; only CREDIT_CARD ones with a due day are used
 * @param {Map}   transactionsByCard      accountId → that card's transactions (full history)
 * @param {string} yearMonth              e.g. "2026-11" — month the bill is due in
 * @param {object} opts
 * @param {boolean} opts.includeUpcoming  keep rows dated after `today`
 * @param {string}  opts.today            ISO date
 */
export function cardInstallmentRows(cards, transactionsByCard, yearMonth, { includeUpcoming, today }) {
  return cards
    .filter((card) => card.kind === 'CREDIT_CARD' && card.dueDayOfMonth != null)
    .flatMap((card) =>
      (transactionsByCard.get(card.id) || [])
        .filter(
          (t) =>
            t.seriesRepeat === 'INSTALLMENTS' &&
            !t.linkedCard &&
            !t.linkedBudget &&
            !t.category?.internal &&
            (includeUpcoming || t.occurredOn <= today) &&
            localYearMonth(billDueDateFor(card, t)) === yearMonth
        )
        .map((t) => ({ ...t, account: t.account ?? card }))
    )
    .sort((a, b) => (a.occurredOn === b.occurredOn ? a.id - b.id : a.occurredOn < b.occurredOn ? -1 : 1));
}

export function installmentsTotal(rows) {
  return rows.reduce((sum, t) => sum + Number(t.amount), 0);
}
