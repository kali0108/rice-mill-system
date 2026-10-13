import { T } from './i18n.js';
// Same formulas as the database triggers in supabase/schema.sql. The browser
// uses them for the live preview while typing; the database recalculates on
// save and is always the final authority.

export const MAUND_KG = 40;

const num = (v) => {
  if (v === '' || v == null) return 0;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};
export { num };

export function r2(x) {
  const v = num(x);
  return Math.round((v + (v >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100) / 100;
}

export function kgToMaund(kg) {
  return num(kg) / MAUND_KG;
}

// ---------------------------------------------------------------- purchases
// Katoti (moisture / quality deduction) can be entered three ways; the
// database always stores the resulting total kg in deduction_kg.
export function deductionKg(method, value, baseKg) {
  const v = num(value);
  if (method === 'per_maund') return r2((num(baseKg) / MAUND_KG) * v);
  if (method === 'percent') return r2((num(baseKg) * v) / 100);
  return r2(v);
}

export function purchaseCalc(p) {
  const bagDeduction = r2(num(p.bags) * num(p.bag_wt_kg));
  const afterBardana = r2(num(p.gross_wt) - num(p.tare_wt) - bagDeduction);
  const netWt = r2(afterBardana - num(p.deduction_kg));
  const maunds = netWt / MAUND_KG;
  const amount = r2(maunds * num(p.rate_per_maund));
  const commission = r2((amount * num(p.commission_pct)) / 100);
  const total = r2(amount + commission - num(p.labor_charges));
  const netPayable = r2(total - num(p.advance_applied));
  return { bagDeduction, afterBardana, netWt, maunds, amount, commission, total, netPayable };
}

// ---------------------------------------------------------------- sales
export function rateUnits(qtyKg, unit) {
  const q = num(qtyKg);
  if (unit === 'maund') return q / MAUND_KG;
  if (unit === 'mt') return q / 1000;
  return q;
}

// amountFc = in the bill's currency; amount = in Rupees (what the khata uses)
export function saleCalc(s) {
  const qty = num(s.qty_kg);
  const foreign = s.currency && s.currency !== 'PKR';
  const fx = foreign ? num(s.fx_rate) : 1;
  const amountFc = r2(rateUnits(qty, s.rate_unit) * num(s.rate));
  const amount = r2(amountFc * fx);
  const taxAmount = r2((amount * num(s.tax_pct)) / 100);
  const netAmount = r2(amount + taxAmount);
  const balance = r2(netAmount - num(s.received_now));
  return { qty, maunds: qty / MAUND_KG, mt: qty / 1000, amountFc, fx, amount, taxAmount, netAmount, balance, foreign };
}

export function contractValue(c) {
  const fc = r2(rateUnits(c.qty_kg, c.rate_unit) * num(c.rate));
  const fx = c.currency && c.currency !== 'PKR' ? num(c.fx_rate) || 1 : 1;
  return { fc, pkr: r2(fc * fx) };
}

export function money(n, currency) {
  return !currency || currency === 'PKR' ? rs(n) : `${currency} ${fmt(n, 2)}`;
}

// ---------------------------------------------------------------- production
// Category of a product name ('rice' | 'broken' | 'byproduct' | 'other' | 'paddy').
// `categoryOf` comes from the managed Products list; these defaults cover the
// built-in names (and old entries) when no list is passed.
const DEFAULT_CATEGORY = {
  'rice - full grain': 'rice', 'sella rice': 'rice', 'steam rice': 'rice',
  'kanki 25%': 'broken', 'kanki 50%': 'broken', 'kanki 100%': 'broken', 'kanki/broken': 'broken',
  'bran/chokar': 'byproduct', 'husk/tuti': 'byproduct', paddy: 'paddy',
};
export function defaultCategory(name) {
  return DEFAULT_CATEGORY[String(name || '').trim().toLowerCase()] || 'other';
}

// Output lines of a batch: new entries have `outputs`; old ones only the fixed columns
export function outputLines(b) {
  if (Array.isArray(b.outputs) && b.outputs.length) {
    return b.outputs.map((o) => ({ product: o.product, qty_kg: num(o.qty_kg) })).filter((o) => o.product && o.qty_kg);
  }
  return [
    ['Rice - Full Grain', b.rice_output_kg], ['Kanki 25%', b.kanki25], ['Kanki 50%', b.kanki50],
    ['Kanki 100%', b.kanki100], ['Bran/Chokar', b.bran_kg], ['Husk/Tuti', b.husk_kg],
  ].map(([product, q]) => ({ product, qty_kg: num(q) })).filter((o) => o.qty_kg);
}

export function productionCalc(b, categoryOf = defaultCategory) {
  const input = num(b.paddy_input_kg);
  let fullGrain = 0;
  let broken = 0;
  let byproducts = 0;
  let other = 0;
  for (const l of outputLines(b)) {
    const c = categoryOf(l.product) || 'other';
    if (c === 'rice') fullGrain += l.qty_kg;
    else if (c === 'broken') broken += l.qty_kg;
    else if (c === 'byproduct') byproducts += l.qty_kg;
    else other += l.qty_kg;
  }
  fullGrain = r2(fullGrain);
  broken = r2(broken);
  const totalRice = r2(fullGrain + broken);
  const wastage = num(b.wastage_kg);
  const accounted = r2(totalRice + byproducts + other + wastage);
  const recoveryPct = input > 0 ? (totalRice / input) * 100 : 0;
  const fullGrainPct = input > 0 ? (fullGrain / input) * 100 : 0;
  const unaccounted = r2(input - accounted);
  return { input, fullGrain, broken, kanki: broken, totalRice, byproducts: r2(byproducts), other: r2(other), wastage, accounted, recoveryPct, fullGrainPct, unaccounted };
}

export function stockLotCalc(s) {
  return { totalWeight: r2(num(s.bags) * num(s.weight_per_bag_kg)) };
}

export function laborCalc(l) {
  const gross = r2(num(l.rate_or_wage) * num(l.units_or_days));
  const net = r2(gross - num(l.advance_deducted));
  return { gross, net };
}

export function transportCalc(t) {
  const freightAmount = r2(num(t.qty_kg) * num(t.freight_rate_per_kg));
  const commissionAmount = r2((num(t.commission_base_amount) * num(t.commission_pct)) / 100);
  return { freightAmount, commissionAmount, total: r2(freightAmount + commissionAmount) };
}

export function taxCalc(t) {
  return { taxAmount: r2((num(t.taxable_amount) * num(t.tax_pct)) / 100) };
}

export function zakatCalc(z) {
  const v = num(z.cash_in_hand) + num(z.bank_balance) + num(z.stock_value) + num(z.receivables) - num(z.payables);
  const zakatable = r2(Math.max(v, 0));
  const due = v > 0 && v >= num(z.nisab_threshold) ? r2(v * 0.025) : 0;
  return { zakatable, due };
}

// ---------------------------------------------------------------- formatting
export function fmt(n, maxDigits = 0) {
  const v = num(n);
  return v.toLocaleString('en-US', { maximumFractionDigits: maxDigits, minimumFractionDigits: 0 });
}

// Up to 2 decimals, only when the number actually has them (4,900 / 4,900.5)
export function fmtNum(n) {
  return fmt(n, 2);
}

export function rs(n) {
  return 'Rs ' + fmt(n, 2);
}

export function kgs(n) {
  return fmt(n, 2) + ' kg';
}

export function maunds(kg) {
  return fmt(kgToMaund(kg), 2) + ' md';
}

export function pct(n, digits = 1) {
  return num(n).toFixed(digits) + '%';
}

// "+ = Mill ne dena hai", "- = Party ne dena hai" (balance = credit - debit)
export function balanceSide(balance) {
  const b = r2(balance);
  if (b > 0) return { kind: 'pos', short: T('Mill ne dena'), long: T('Mill ne party ko dena hai (Jama)') };
  if (b < 0) return { kind: 'neg', short: T('Party ne dena'), long: T('Party ne mill ko dena hai (Banam)') };
  return { kind: 'zero', short: T('Barabar'), long: T('Hisaab barabar (settled)') };
}

export function sum(rows, fn) {
  let s = 0;
  for (const r of rows) s += num(typeof fn === 'function' ? fn(r) : r[fn]);
  return r2(s);
}

// Keep the current value selectable even if it is not in the list anymore
// (old records created with an older list of options).
export function withCurrent(list, value) {
  if (!value || list.includes(value)) return list;
  return [...list, value];
}

// Mill's namee rule: e.g. base 14%, 1 kg per maund for every 1% above it.
// Returns null when the rule is off or the paddy is within the base.
export function moistureRule(moisturePct, basePct, kgPerPoint) {
  const m = num(moisturePct);
  const base = num(basePct);
  const per = num(kgPerPoint);
  if (base <= 0 || per <= 0 || m <= base) return null;
  const points = r2(m - base);
  return { points, kgPerMaund: r2(points * per) };
}
