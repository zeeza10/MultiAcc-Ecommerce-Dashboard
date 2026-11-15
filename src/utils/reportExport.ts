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
  '<style>@page{size:A4 landscape;margin:16mm}*{box-sizing:border-box}body{font:10px/1.45 Arial,Helvetica,sans-serif;color:#172033;margin:0}' +
  '.brand{font-size:22px;font-weight:700;letter-spacing:.4px;color:#172554}.sub{color:#64748b;font-size:10px}h1{font-size:17px;margin:22px 0 5px}' +
  '.meta{display:flex;justify-content:space-between;border-bottom:2px solid #1e3a8a;padding:8px 0 12px;color:#475569}' +
  'table{width:100%;border-collapse:collapse;margin-top:16px;table-layout:auto}th{background:#eaf0f8;color:#172554;text-align:left;font-weight:700}' +
  'th,td{border:1px solid #cbd5e1;padding:7px 8px;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fafc}' +
  '.count{margin-top:10px;color:#475569}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #cbd5e1;padding-top:7px;color:#64748b;font-size:9px}' +
  '@media screen{body{padding:24px}.footer{position:static;margin-top:24px}}</style></head><body>' +
  '<header><div class="brand">OriaFuture</div><div class="sub">E-Commerce &amp; 3PL Operating Platform</div></header>' +
  '<h1>' + esc(title) + '</h1><div class="meta"><span>Business Report</span><span>Generated: ' + esc(generatedAt) + '</span></div>' +
  '<table><thead><tr>' + tableHead + '</tr></thead><tbody>' + (tableRows || emptyRow) + '</tbody></table>' +
  '<div class="count">Total records: ' + rows.length + '</div><div class="footer">OriaFuture | Confidential business report | Generated from the active workspace</div>' +
  '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script></body></html>';
  const popup = window.open('', '_blank');
  if (!popup) { window.alert('Please allow pop-ups to generate the PDF report.'); return; }
  popup.document.open(); popup.document.write(html); popup.document.close();
}
