import type { SaleRow, PurchaseRow } from './demo-data';

/** RFC-style quoting, escaped quotes, BOM, CRLF and quoted newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else if (closed && /\s/.test(c)) continue;
    else if (closed || c === '"') throw new Error('Malformed CSV quoting.');
    else field += c;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted field.');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  if (!rows.length) throw new Error('CSV is empty.');
  const headers = rows.shift()!.map(v => v.trim().toLowerCase().replace(/[ _-]/g, ''));
  if (headers.some(v => !v) || new Set(headers).size !== headers.length) throw new Error('CSV headers must be nonempty and unique.');
  return rows.map((r, i) => {
    if (r.length !== headers.length) throw new Error(`Row ${i + 2}: expected ${headers.length} columns.`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
  });
}
function required(r: Record<string, string>, keys: string[], row: number) {
  for (const k of keys) if (!r[k]) throw new Error(`Row ${row}: missing ${k}.`);
}
function numberValue(value: string, key: string, row: number, zero = false) {
  if (!value || !/^(?:\d+\.?\d*|\.\d+)$/.test(value)) throw new Error(`Row ${row}: ${key} must be a number.`);
  const n = Number(value);
  if (!Number.isFinite(n) || (zero ? n < 0 : n <= 0)) throw new Error(`Row ${row}: ${key} must be ${zero ? 'nonnegative' : 'positive'}.`);
  return n;
}
function dateValue(value: string, row: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Row ${row}: date must use YYYY-MM-DD.`);
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error(`Row ${row}: invalid date.`);
  return value;
}
export function parseSalesCsv(text: string): SaleRow[] {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Sales CSV must contain at least one data row.');
  return rows.map((r, i) => {
    const row = i + 2; required(r, ['date', 'product', 'quantity'], row);
    if (r.soldout && !['true', 'false', '1', '0', 'yes', 'no'].includes(r.soldout.toLowerCase())) throw new Error(`Row ${row}: soldOut must be true or false.`);
    return { date: dateValue(r.date, row), product: r.product, quantity: numberValue(r.quantity, 'quantity', row, true), soldOut: ['true', '1', 'yes'].includes((r.soldout || '').toLowerCase()) };
  });
}
export function parsePurchasesCsv(text: string): PurchaseRow[] {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Purchases CSV must contain at least one data row.');
  return rows.map((r, i) => {
    const row = i + 2; required(r, ['date', 'ingredient', 'quantity', 'unit', 'unitprice', 'currency', 'supplier', 'invoiceid'], row);
    const unit = ({ kg: 'kg', l: 'L', units: 'units' } as const)[r.unit.toLowerCase() as 'kg' | 'l' | 'units'];
    if (!unit) throw new Error(`Row ${row}: unsupported unit "${r.unit}"; use kg, L, or units and convert case quantities first.`);
    const currency = r.currency.toUpperCase();
    if (!['CAD', 'USD', 'INR', 'PKR'].includes(currency)) throw new Error(`Row ${row}: currency must be CAD, USD, INR, or PKR. Native amounts are preserved.`);
    return { date: dateValue(r.date, row), ingredient: r.ingredient, quantity: numberValue(r.quantity, 'quantity', row), unit, unitPrice: numberValue(r.unitprice, 'unitPrice', row), currency: currency as PurchaseRow['currency'], supplier: r.supplier, invoiceId: r.invoiceid, entityId: r.entityid || null, needsReview: true, source: 'CSV import' };
  });
}
/** Strings that spreadsheet software could interpret as formulas are neutralized. */
export function exportCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const keys = columns || Object.keys(rows[0] || {});
  const encode = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (typeof v !== 'number' && /^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [keys.map(encode).join(','), ...rows.map(r => keys.map(k => encode(r[k])).join(','))].join('\r\n');
}
