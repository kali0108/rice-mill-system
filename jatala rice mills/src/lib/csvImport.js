import { parseFlexibleDate } from './dates.js';
import { uuid } from './uuid.js';

// RFC-4180 style parser: quoted fields, embedded commas/newlines, "" escapes,
// Excel's BOM and CRLF line endings.
export function parseCSV(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* \n ends the line */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ''])));
}

function toNumber(v) {
  const s = String(v).replace(/,/g, '').replace(/^Rs\.?\s*/i, '').trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Converts one parsed CSV row into a payload for `table`.
// Returns { row } or { error } or { skip } (auto khata rows are rebuilt by the
// database from their source entries, so importing them would double count).
export function coerceImportRow(tableDef, raw, tableName) {
  const out = {};
  for (const [col, type] of Object.entries(tableDef.cols)) {
    if (!(col in raw)) continue;
    const v = raw[col];
    const s = typeof v === 'string' ? v.trim() : v;
    if (s === '' || s == null) continue;
    if (type === 'text') out[col] = String(v);
    else if (type === 'number' || type === 'int') {
      const n = toNumber(s);
      if (n === undefined) continue;
      if (Number.isNaN(n)) return { error: `"${col}" mein number hona chahiye, mila: ${s}` };
      out[col] = type === 'int' ? Math.round(n) : n;
    } else if (type === 'date') {
      const d = parseFlexibleDate(s);
      if (!d) return { error: `"${col}" ki tareekh samajh nahi aayi: ${s} (YYYY-MM-DD ya DD/MM/YYYY likhein)` };
      out[col] = d;
    } else if (type === 'json') {
      try {
        out[col] = JSON.parse(String(s));
      } catch {
        return { error: `"${col}" mein sahi JSON nahi: ${String(s).slice(0, 40)}` };
      }
    } else if (type === 'bool') {
      out[col] = /^(true|yes|y|1|haan|paid)$/i.test(String(s));
    }
  }
  if (tableName === 'ledger_entries') {
    const src = String(raw.source || 'manual').trim() || 'manual';
    if (src !== 'manual') return { skip: true };
    delete out.source;
  }
  out.id = uuid();
  return { row: out };
}
