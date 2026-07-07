// `new Date("yyyy-MM-dd")` parses date-only strings as UTC midnight, which
// renders as the previous calendar day in any timezone behind UTC. Backend
// `occurredOn` values are plain LocalDate strings with no time component, so
// parse them as local midnight instead.
export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
