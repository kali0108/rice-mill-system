import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, coerceImportRow } from '../../src/lib/csvImport.js';
import { toCSV } from '../../src/lib/csv.js';
import { TABLES } from '../../src/lib/schema.js';

test('parses Excel CSV: BOM, CRLF, quotes, commas and newlines inside fields', () => {
  const text = '\uFEFFdate,party_name,description\r\n2026-10-01,"Ali, Sons","line1\nline2"\r\n2026-10-02,"He said ""ok""",x\r\n\r\n';
  const rows = parseCSV(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].party_name, 'Ali, Sons');
  assert.equal(rows[0].description, 'line1\nline2');
  assert.equal(rows[1].party_name, 'He said "ok"');
});

test('export -> import round trip keeps text exactly', () => {
  const csv = toCSV(['cheque_no', 'notes'], [['000123', 'a "quote", comma']]);
  const back = parseCSV(csv);
  assert.equal(back[0].cheque_no, '000123');
  assert.equal(back[0].notes, 'a "quote", comma');
});

test('import coercion follows column types', () => {
  const { row } = coerceImportRow(TABLES.payments, {
    date: '09/10/2026', party_type: 'Kisan', party_name: 'Ali', direction: 'Paid', method: 'Cheque',
    amount: '1,25,000', cheque_no: '000123', unknown_column: 'x', id: 'old-id', created_at: 'x',
  }, 'payments');
  assert.equal(row.date, '2026-10-09');
  assert.equal(row.amount, 125000);
  assert.equal(row.cheque_no, '000123', 'leading zeros kept');
  assert.ok(!('unknown_column' in row));
  assert.ok(!('created_at' in row));
  assert.notEqual(row.id, 'old-id', 'imports always create new rows');
});

test('import rejects bad values with a clear message', () => {
  assert.match(coerceImportRow(TABLES.sales, { date: '2026-10-01', qty_kg: 'abc' }, 'sales').error, /qty_kg/);
  assert.match(coerceImportRow(TABLES.sales, { date: '32/13/2026' }, 'sales').error, /tareekh/);
});

test('auto khata rows are skipped (they are rebuilt from their source entries)', () => {
  assert.ok(coerceImportRow(TABLES.ledger_entries, { date: '2026-10-01', source: 'purchase' }, 'ledger_entries').skip);
  const manual = coerceImportRow(TABLES.ledger_entries, { date: '2026-10-01', party_type: 'Kisan', party_name: 'A', debit: '5', source: 'manual' }, 'ledger_entries');
  assert.equal(manual.row.debit, 5);
  assert.ok(!('source' in manual.row));
});

test('booleans', () => {
  const { row } = coerceImportRow(TABLES.labor_entries, { name: 'A', date: '2026-10-01', paid: 'Yes' }, 'labor_entries');
  assert.equal(row.paid, true);
});

test('production outputs travel as JSON in CSV', () => {
  const ok = coerceImportRow(TABLES.production_batches, { date: '2026-10-01', lot_no: 'L1', paddy_input_kg: '100', outputs: '[{"product":"B1 Tota","qty_kg":5}]' }, 'production_batches');
  assert.deepEqual(ok.row.outputs, [{ product: 'B1 Tota', qty_kg: 5 }]);
  assert.match(coerceImportRow(TABLES.production_batches, { outputs: '[broken' }, 'production_batches').error, /JSON/);
});

test('products and varieties can be exported/imported', () => {
  const { row } = coerceImportRow(TABLES.products, { name: 'B1 Tota', category: 'broken', has_variety: 'yes', sort_order: '23' }, 'products');
  assert.equal(row.has_variety, true);
  assert.equal(row.sort_order, 23);
  assert.ok(TABLES.varieties.cols.name);
});
