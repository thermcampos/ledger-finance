// Amount-aware search matching for transaction lists.
//
// The UI renders amounts formatted (e.g. "-$11.00"), but transactions arrive
// as JSON numbers ("-11.00" from the backend parses to -11, trailing zeros
// gone). Matching a search term against String(amount) therefore misses what
// the user actually sees. amountMatchesSearch compares the term against the
// rendered forms instead, and accepts both '.' and ',' as decimal separator.

export function amountMatchesSearch(amount, term) {
  const num = Number(amount);
  if (Number.isNaN(num)) return false;

  const fixed = Math.abs(num).toFixed(2); // "11.00"
  const grouped = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }); // "1,234.50"

  const cleaned = term.trim().toLowerCase().replace(/[$\s]/g, '').replace(/^-/, '');
  if (!cleaned) return false;

  if (fixed.includes(cleaned) || grouped.includes(cleaned)) return true;
  const dotted = cleaned.replace(',', '.');
  if (dotted !== cleaned && (fixed.includes(dotted) || grouped.includes(dotted))) return true;

  // Numeric-looking term ("11", "11.0", "11,00"): compare digit sequences so
  // any number of decimal places matches the rendered two-decimal amount.
  if (/\d/.test(cleaned) && /^\d*[.,]?\d*$/.test(cleaned)) {
    const amountDigits = fixed.replace('.', '');
    const termDigits = cleaned.replace(/\D/g, '');
    return amountDigits.includes(termDigits);
  }
  return false;
}

export function matchesTransactionSearch(t, term) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return true;
  return (
    t.description.toLowerCase().includes(normalized) ||
    (t.category?.name || '').toLowerCase().includes(normalized) ||
    amountMatchesSearch(t.amount, normalized)
  );
}
