export function purchaseCalc(p) {
  const netWt = (Number(p.gross_wt) || 0) - (Number(p.tare_wt) || 0);
  const amount = (netWt / 40) * (Number(p.rate_per_maund) || 0);
  const netPayable = amount - (Number(p.advance_applied) || 0);
  return { netWt, amount, netPayable };
}

export function productionCalc(b) {
  const totalRice = (Number(b.rice_output_kg) || 0) + (Number(b.kanki25) || 0) + (Number(b.kanki50) || 0) + (Number(b.kanki100) || 0);
  const recoveryPct = b.paddy_input_kg ? (totalRice / Number(b.paddy_input_kg)) * 100 : 0;
  return { totalRice, recoveryPct };
}

export function saleCalc(s) {
  const amount = (Number(s.qty_kg) || 0) * (Number(s.rate) || 0);
  const taxAmount = (amount * (Number(s.tax_pct) || 0)) / 100;
  const netAmount = amount + taxAmount;
  return { amount, taxAmount, netAmount };
}

export function stockCalc(s) {
  const totalWeight = (Number(s.bags) || 0) * (Number(s.weight_per_bag_kg) || 0);
  return { totalWeight };
}

export function laborCalc(l) {
  const gross = (Number(l.rate_or_wage) || 0) * (Number(l.units_or_days) || 0);
  const net = gross - (Number(l.advance_deducted) || 0);
  return { gross, net };
}

export function transportCalc(t) {
  const freightAmount = (Number(t.qty_kg) || 0) * (Number(t.freight_rate_per_kg) || 0);
  const commissionAmount = ((Number(t.commission_base_amount) || 0) * (Number(t.commission_pct) || 0)) / 100;
  return { freightAmount, commissionAmount };
}

export function taxCalc(t) {
  const taxAmount = ((Number(t.taxable_amount) || 0) * (Number(t.tax_pct) || 0)) / 100;
  return { taxAmount };
}

export function zakatCalc(z) {
  const zakatable =
    (Number(z.cash_in_hand) || 0) + (Number(z.bank_balance) || 0) + (Number(z.stock_value) || 0) +
    (Number(z.receivables) || 0) - (Number(z.payables) || 0);
  const due = zakatable >= (Number(z.nisab_threshold) || 0) ? zakatable * 0.025 : 0;
  return { zakatable: Math.max(zakatable, 0), due };
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}
export function addDays(str, n) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}
export function fmt(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}
export function rs(n) {
  return 'Rs ' + fmt(n);
}
