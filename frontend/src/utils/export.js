export function toCsv(rows) {
  const header = ['Date', 'Description', 'Category', 'Account', 'Amount', 'Running balance'];
  const lines = rows.map((t) => [
    t.occurredOn,
    t.description,
    t.category?.name || 'Uncategorized',
    t.account?.name || '',
    t.amount,
    t.runningBalance,
  ]);
  return [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
