// `new Date("yyyy-MM-dd")` parses date-only strings as UTC midnight, which
// renders as the previous calendar day in any timezone behind UTC. Backend
// `occurredOn` values are plain LocalDate strings with no time component, so
// parse them as local midnight instead.
export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Rolls `dueDay` forward to its next on-or-after occurrence relative to
// `fromDate` (defaults to today), clamping for months shorter than dueDay
// (e.g. day 31 in a 30-day month lands on that month's last day).
export function nextDueDate(dueDay, fromDate = new Date()) {
  const clamp = (y, m) => Math.min(dueDay, daysInMonth(y, m));
  let y = fromDate.getFullYear();
  let m = fromDate.getMonth();
  let candidate = new Date(y, m, clamp(y, m));
  if (candidate < startOfDay(fromDate)) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    candidate = new Date(y, m, clamp(y, m));
  }
  return candidate;
}

export function dueLabel(dueDate, today = new Date()) {
  const diffDays = Math.round((startOfDay(dueDate) - startOfDay(today)) / 86400000);
  const dateStr = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diffDays === 0) return `Due today · ${dateStr}`;
  if (diffDays === 1) return `Due tomorrow · ${dateStr}`;
  return `Due ${dateStr} · in ${diffDays} days`;
}
