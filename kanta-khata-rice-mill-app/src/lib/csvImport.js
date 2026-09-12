// Minimal RFC4180-ish CSV parser (handles quoted fields, embedded commas,
// escaped "" quotes) — no external dependency needed for this app's scale.
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip, \n handles the line break */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? ''])));
}

// DB-managed columns that shouldn't come from an import file — let Postgres
// generate fresh ones so re-importing an old export can't collide with
// existing rows or misattribute authorship.
const OMIT_ON_IMPORT = ['id', 'created_at', 'created_by'];

export function coerceRow(obj) {
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (OMIT_ON_IMPORT.includes(k)) return;
    const s = typeof v === 'string' ? v.trim() : v;
    if (s === '' || s === null || s === undefined) { out[k] = null; return; }
    if (typeof s === 'string' && /^-?\d+(\.\d+)?$/.test(s)) { out[k] = Number(s); return; }
    if (typeof s === 'string' && /^(true|false)$/i.test(s)) { out[k] = s.toLowerCase() === 'true'; return; }
    out[k] = s;
  });
  return out;
}
