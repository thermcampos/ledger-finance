// The Report page's "Installments" follow-up list: installment rows only
// (recurring weekly/monthly/yearly series are skipped), oldest first.
// Read-only — these rows are already counted in their categories' spending,
// so the total here is never added to the report's totals.

/** @param {Array<Array>} lists per-category transaction lists, already filtered for visibility */
export function installmentRows(lists) {
  return lists
    .flatMap((list) => list || [])
    .filter((t) => t.seriesRepeat === 'INSTALLMENTS')
    .sort((a, b) => (a.occurredOn === b.occurredOn ? a.id - b.id : a.occurredOn < b.occurredOn ? -1 : 1));
}

export function installmentsTotal(rows) {
  return rows.reduce((sum, t) => sum + Number(t.amount), 0);
}
