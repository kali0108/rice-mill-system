import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purchaseCalc, saleCalc, productionCalc, outputLines, defaultCategory, contractValue, rateUnits, money, moistureRule, laborCalc, transportCalc, taxCalc, zakatCalc, deductionKg, r2, fmt, rs, balanceSide, sum, withCurrent } from '../../src/lib/calc.js';

test('purchase: same numbers as the database trigger', () => {
  const c = purchaseCalc({ gross_wt: 5200, tare_wt: 200, bags: 100, bag_wt_kg: 1, deduction_kg: 20, rate_per_maund: 4000, advance_applied: 50000 });
  assert.equal(c.netWt, 4880);
  assert.equal(c.amount, 488000);
  assert.equal(c.total, 488000);
  assert.equal(c.netPayable, 438000);
});

test('purchase via arhti: commission added, mazdoori deducted', () => {
  const c = purchaseCalc({ gross_wt: 2000, tare_wt: 0, bags: 50, rate_per_maund: 3600, commission_pct: 2, labor_charges: 500 });
  assert.equal(c.amount, 180000);
  assert.equal(c.commission, 3600);
  assert.equal(c.total, 183100);
});

test('purchase: string inputs from forms, commas and blanks', () => {
  const c = purchaseCalc({ gross_wt: '1,000', tare_wt: '', bags: '', rate_per_maund: '3250.5' });
  assert.equal(c.netWt, 1000);
  assert.equal(c.amount, 81262.5);
});

test('katoti methods', () => {
  assert.equal(deductionKg('kg', '15', 4000), 15);
  assert.equal(deductionKg('per_maund', '1', 4000), 100); // 100 maund x 1 kg
  assert.equal(deductionKg('percent', '2', 4000), 80);
  assert.equal(deductionKg('kg', '', 4000), 0);
});

test('sale per maund and per kg with GST', () => {
  assert.equal(saleCalc({ qty_kg: 2000, rate: 9000, rate_unit: 'maund' }).amount, 450000);
  const s = saleCalc({ qty_kg: 500, rate: 50, tax_pct: 18, rate_unit: 'kg', received_now: 9500 });
  assert.equal(s.netAmount, 29500);
  assert.equal(s.balance, 20000);
});

test('export sale: USD per metric ton -> Rupees (same as the database)', () => {
  const s = saleCalc({ qty_kg: 10000, rate: 950, rate_unit: 'mt', currency: 'USD', fx_rate: 280 });
  assert.equal(s.amountFc, 9500);
  assert.equal(s.amount, 2660000);
  assert.equal(s.mt, 10);
  assert.equal(saleCalc({ qty_kg: 2000, rate: 9000, rate_unit: 'maund' }).amount, 450000);
  assert.equal(saleCalc({ qty_kg: 100, rate: 5, currency: 'PKR', fx_rate: 999 }).amount, 500, 'PKR ignores fx');
});

test('sauda value and units', () => {
  assert.deepEqual(contractValue({ qty_kg: 20000, rate: 950, rate_unit: 'mt', currency: 'USD', fx_rate: 280 }), { fc: 19000, pkr: 5320000 });
  assert.equal(rateUnits(4000, 'maund'), 100);
  assert.equal(money(1500.5, 'USD'), 'USD 1,500.5');
  assert.equal(money(1500, 'PKR'), 'Rs 1,500');
});

test('production recovery and unaccounted', () => {
  const c = productionCalc({ paddy_input_kg: 4000, rice_output_kg: 2200, kanki25: 200, kanki50: 100, kanki100: 100, bran_kg: 300, husk_kg: 900, wastage_kg: 200 });
  assert.equal(c.recoveryPct, 65);
  assert.ok(Math.abs(c.fullGrainPct - 55) < 1e-9);
  assert.equal(c.unaccounted, 0);
  assert.equal(productionCalc({ paddy_input_kg: 0, rice_output_kg: 5 }).recoveryPct, 0);
});

test('production from output lines with a product the Owner added', () => {
  const batch = {
    paddy_input_kg: 1000, wastage_kg: 50,
    outputs: [{ product: 'Sella Rice', qty_kg: 500 }, { product: 'B1 Tota', qty_kg: '150' }, { product: 'Husk/Tuti', qty_kg: 200 }, { product: 'Rice Polish', qty_kg: 100 }],
  };
  const cats = { 'sella rice': 'rice', 'b1 tota': 'broken', 'husk/tuti': 'byproduct', 'rice polish': 'byproduct' };
  const c = productionCalc(batch, (n) => cats[n.toLowerCase()]);
  assert.equal(c.fullGrain, 500);
  assert.equal(c.broken, 150);
  assert.equal(c.recoveryPct, 65);
  assert.equal(c.byproducts, 300);
  assert.equal(c.unaccounted, 0);
  // without the list, an unknown product is not counted as rice
  assert.equal(productionCalc(batch).totalRice, 500);
});

test('old batches (fixed columns) still calculate', () => {
  const lines = outputLines({ rice_output_kg: 50, kanki25: 10, bran_kg: 5, outputs: [] });
  assert.deepEqual(lines.map((l) => l.product), ['Rice - Full Grain', 'Kanki 25%', 'Bran/Chokar']);
  assert.equal(defaultCategory('kanki 50%'), 'broken');
  assert.equal(defaultCategory('Something New'), 'other');
});

test('labor, transport, tax', () => {
  assert.deepEqual(laborCalc({ rate_or_wage: 1000, units_or_days: 6, advance_deducted: 1000 }), { gross: 6000, net: 5000 });
  assert.deepEqual(transportCalc({ qty_kg: 2000, freight_rate_per_kg: 2.5, commission_base_amount: 10000, commission_pct: 1 }), { freightAmount: 5000, commissionAmount: 100, total: 5100 });
  assert.equal(taxCalc({ taxable_amount: 100000, tax_pct: 1 }).taxAmount, 1000);
});

test('zakat: only above nisab, never on a negative total', () => {
  assert.deepEqual(zakatCalc({ cash_in_hand: 1000000, nisab_threshold: 200000 }), { zakatable: 1000000, due: 25000 });
  assert.deepEqual(zakatCalc({ cash_in_hand: 100000, nisab_threshold: 200000 }), { zakatable: 100000, due: 0 });
  assert.deepEqual(zakatCalc({ cash_in_hand: 0, payables: 50000, nisab_threshold: 0 }), { zakatable: 0, due: 0 });
});

test('rounding and formatting', () => {
  assert.equal(r2(0.1 + 0.2), 0.3);
  assert.equal(fmt(1234567), '1,234,567');
  assert.equal(rs(4900.5), 'Rs 4,900.5');
  assert.equal(rs(-200), 'Rs -200');
  assert.equal(sum([{ a: '1.5' }, { a: 2 }, { a: null }], 'a'), 3.5);
});

test('balance side convention (credit - debit)', () => {
  assert.equal(balanceSide(500).kind, 'pos');
  assert.equal(balanceSide(-1).kind, 'neg');
  assert.equal(balanceSide(0.001).kind, 'zero');
});

test('withCurrent keeps an old value selectable', () => {
  assert.deepEqual(withCurrent(['A', 'B'], 'Old'), ['A', 'B', 'Old']);
  assert.deepEqual(withCurrent(['A', 'B'], 'A'), ['A', 'B']);
});

test('namee (moisture) rule: kg per maund above the base', () => {
  assert.deepEqual(moistureRule(17, 14, 1), { points: 3, kgPerMaund: 3 });
  assert.deepEqual(moistureRule('16.5', '14', '1.2'), { points: 2.5, kgPerMaund: 3 });
  assert.equal(moistureRule(13, 14, 1), null, 'dry paddy: no katoti');
  assert.equal(moistureRule(20, 0, 1), null, 'rule off');
});
