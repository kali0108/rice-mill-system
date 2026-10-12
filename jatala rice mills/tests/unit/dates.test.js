// Run in Pakistan time — the old app's UTC-based dates broke exactly here.
process.env.TZ = 'Asia/Karachi';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { todayStr, addDays, daysBetween, endOfMonth, startOfWeek, prevMonthRange, parseFlexibleDate, fmtDate, isValidYmd, ymd } = await import('../../src/lib/dates.js');

test('todayStr is the LOCAL date (not UTC)', () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(todayStr(), expected);
});

test('addDays works in UTC+5 (old version returned the previous day)', () => {
  assert.equal(addDays('2026-10-09', 1), '2026-10-10');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  // what the old implementation did:
  const old = (str, n) => { const d = new Date(str + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  assert.equal(old('2026-10-09', 1), '2026-10-09', 'old bug reproduced: +1 day stayed on the same date');
});

test('daysBetween', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(daysBetween('2026-10-31', '2026-10-01'), -30);
  assert.ok(Number.isNaN(daysBetween(null, '2026-10-01')));
});

test('month / week helpers', () => {
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29');
  assert.equal(startOfWeek('2026-10-11'), '2026-10-05'); // Sunday -> Monday before
  assert.deepEqual(prevMonthRange('2026-01-15'), ['2025-12-01', '2025-12-31']);
});

test('dates Excel writes back into CSV files', () => {
  assert.equal(parseFlexibleDate('2026-10-09'), '2026-10-09');
  assert.equal(parseFlexibleDate('09/10/2026'), '2026-10-09');
  assert.equal(parseFlexibleDate('9-10-26'), '2026-10-09');
  assert.equal(parseFlexibleDate('31/02/2026'), null);
  assert.equal(parseFlexibleDate('hello'), null);
});

test('formatting', () => {
  assert.equal(fmtDate('2026-10-09'), '09 Oct 2026');
  assert.equal(fmtDate(null), '—');
  assert.ok(isValidYmd('2026-02-28'));
  assert.ok(!isValidYmd('2026-02-30'));
  assert.equal(ymd(new Date(2026, 0, 5)), '2026-01-05');
});
