export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number | boolean | null | undefined>;

const safeCell = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return /^[=+@\-	\r]/.test(text) ? "'" + text : text;
};
const csvCell = (value: unknown) => '"' + safeCell(value).replace(/"/g, '""') + '"';
const dateStamp = () => new Date().toISOString().slice(0, 10);

export function exportReportCsv(title: string, columns: ReportColumn[], rows: ReportRow[]) {
  const content = [columns.map(c => csvCell(c.label)).join(','), ...rows.map(row =>
    columns.map(column => csvCell(row[column.key])).join(',')
  )].join('\r\n');
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'OriaFuture_' + title.replace(/[^a-z0-9]+/gi, '_') + '_' + dateStamp() + '.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportReportPdf(title: string, columns: ReportColumn[], rows: ReportRow[]) {
  const generatedAt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date()) + ' UTC';
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
  const tableHead = columns.map(column => '<th>' + esc(column.label) + '</th>').join('');
  const tableRows = rows.map(row => '<tr>' + columns.map(column => '<td>' + esc(row[column.key]) + '</td>').join('') + '</tr>').join('');
  const emptyRow = '<tr><td colspan="' + columns.length + '">No records available for this report.</td></tr>';
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>OriaFuture - ' + esc(title) + '</title>' +
  '<link rel="stylesheet" href="' + esc(window.location.origin + '/report-export.css') + '"></head><body>' +
  '<header><div class="brand">OriaFuture</div><div class="sub">E-Commerce &amp; 3PL Operating Platform</div></header>' +
  '<h1>' + esc(title) + '</h1><div class="meta"><span>Business Report</span><span>Generated: ' + esc(generatedAt) + '</span></div>' +
  '<table><thead><tr>' + tableHead + '</tr></thead><tbody>' + (tableRows || emptyRow) + '</tbody></table>' +
  '<div class="count">Total records: ' + rows.length + '</div><div class="footer">OriaFuture | Confidential business report | Generated from the active workspace</div>' +
  '</body></html>';
  const popup = window.open('', '_blank');
  if (!popup) { window.alert('Please allow pop-ups to generate the PDF report.'); return; }
  popup.opener = null;
  popup.document.open(); popup.document.write(html); popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}
