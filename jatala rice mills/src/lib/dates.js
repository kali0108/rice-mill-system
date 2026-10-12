// All dates in the app are plain 'YYYY-MM-DD' strings in the device's local
// time (Pakistan). The old version used toISOString(), which is UTC — so
// between 12am and 5am it saved YESTERDAY's date, and addDays() returned the
// wrong day. Everything here works on local calendar dates only.

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return ymd(new Date());
}

export function parseYmd(str) {
  if (!str || typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(str)) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function isValidYmd(str) {
  const d = parseYmd(str);
  return !!d && ymd(d) === String(str).slice(0, 10);
}

export function addDays(str, n) {
  const d = parseYmd(str);
  if (!d) return '';
  d.setDate(d.getDate() + n);
  return ymd(d);
}

// Whole days from a to b (b - a). NaN if either date is missing.
export function daysBetween(a, b) {
  const da = parseYmd(a);
  const db = parseYmd(b);
  if (!da || !db) return NaN;
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function startOfMonth(str) {
  return String(str).slice(0, 8) + '01';
}

export function endOfMonth(str) {
  const d = parseYmd(str);
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

// Week starts Monday
export function startOfWeek(str) {
  const d = parseYmd(str);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return ymd(d);
}

export function prevMonthRange(str) {
  const d = parseYmd(str);
  return [ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))];
}

export function fmtDate(str) {
  if (!str) return '—';
  const d = parseYmd(String(str));
  if (!d) return String(str);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function monthKey(str) {
  return String(str || '').slice(0, 7);
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  if (!y || !m) return key;
  return `${MONTHS[m - 1]} ${y}`;
}

// Accepts the date formats Excel tends to write back into a CSV:
// 2026-10-09, 09/10/2026, 9-10-2026, 09.10.2026 (day first, Pakistan style).
export function parseFlexibleDate(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const out = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return isValidYmd(out) ? out : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const out = `${year}-${pad(+m[2])}-${pad(+m[1])}`;
    return isValidYmd(out) ? out : null;
  }
  return null;
}
