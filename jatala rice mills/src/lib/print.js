// Printable documents. Everything user-typed is HTML-escaped (the old invoice
// wrote names straight into the page). Opens a print window; if the browser
// blocks pop-ups it prints through a hidden frame instead.
import { fmtDate, fmtDateTime } from './dates.js';
import { fmt, rs, kgToMaund, purchaseCalc, saleCalc, balanceSide, money, contractValue, rateUnits } from './calc.js';
import { rupeesInWords } from './numToWords.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CSS = `
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:18px 22px;font-size:12.5px}
  .doc{max-width:760px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1F2E1A;padding-bottom:8px;margin-bottom:12px;gap:16px}
  .mill{font-size:20px;font-weight:700;color:#1F2E1A}
  .millsub{font-size:11.5px;color:#555;margin-top:2px;line-height:1.45}
  .doctitle{text-align:right}
  .doctitle .t{font-size:16px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#8B6544}
  .doctitle .n{font-size:13px;margin-top:3px}
  table{width:100%;border-collapse:collapse;margin:6px 0 12px}
  th,td{border:1px solid #cfc6b0;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3eee2;font-size:11px;color:#5a4a33}
  td.r,th.r{text-align:right}
  .kv td{border:none;padding:3px 6px}
  .kv td.k{color:#666;width:150px}
  .tot td{font-weight:700;background:#faf7ef}
  .big{font-size:15px;font-weight:700}
  .words{font-style:italic;margin:6px 0 12px}
  .sign{display:flex;justify-content:space-between;margin-top:42px;gap:30px}
  .sign div{flex:1;border-top:1px solid #777;padding-top:4px;text-align:center;color:#555;font-size:11px}
  .foot{margin-top:14px;font-size:10.5px;color:#777;text-align:center}
  .neg{color:#9a2b20}
  @page{size:A4;margin:10mm}
  @media print{body{padding:0}}
`;

function header(settings, title, number) {
  const s = settings || {};
  const lines = [s.address, s.phone ? 'Phone: ' + s.phone : '', [s.ntn ? 'NTN: ' + s.ntn : '', s.strn ? 'STRN: ' + s.strn : ''].filter(Boolean).join('  ·  ')]
    .filter(Boolean).map(esc).join('<br/>');
  return `<div class="head"><div><div class="mill">${esc(s.mill_name || 'Rice Mill')}</div><div class="millsub">${lines}</div></div>
    <div class="doctitle"><div class="t">${esc(title)}</div>${number ? `<div class="n">${esc(number)}</div>` : ''}</div></div>`;
}

function footer(settings) {
  const note = settings?.invoice_footer ? `<div>${esc(settings.invoice_footer)}</div>` : '';
  return `<div class="foot">${note}<div>Printed: ${esc(fmtDateTime(new Date().toISOString()))} — Kanta Khata</div></div>`;
}

export function openPrint(title, bodyHtml) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${CSS}</style></head>
    <body><div class="doc">${bodyHtml}</div></body></html>`;
  const win = window.open('', '_blank');
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch { /* user closed it */ } }, 350);
    return true;
  }
  // pop-up blocked: print through an invisible frame
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* ignore */ }
    setTimeout(() => frame.remove(), 60000);
  }, 350);
  return true;
}

const kv = (rows) => `<table class="kv">${rows.filter(Boolean).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>`;

// ---------------------------------------------------------------- Kanta parchi
export function printPurchaseSlip(p, settings) {
  const c = purchaseCalc(p);
  const net = Number(p.net_wt ?? c.netWt);
  const amount = Number(p.amount ?? c.amount);
  const commission = Number(p.commission_amount ?? c.commission);
  const total = Number(p.total_payable ?? c.total);
  const balance = Number(p.net_payable ?? c.netPayable);
  const party = p.mode === 'Arhti'
    ? `${esc(p.arhti_name)} <span style="color:#666">(Arhti)</span>${p.farmer_name ? ' — Kisan: ' + esc(p.farmer_name) : ''}`
    : esc(p.farmer_name);
  const body = header(settings, 'Paddy Purchase Slip', p.slip_no ? 'Slip # ' + p.slip_no : 'Slip # (sync ke baad)') +
    kv([
      ['Tareekh', esc(fmtDate(p.date))],
      ['Party', party],
      ['Variety', esc(p.variety)],
      p.vehicle_no ? ['Gaari #', esc(p.vehicle_no)] : null,
      ['Bags (Bardana)', esc(fmt(p.bags))],
    ]) +
    `<table><thead><tr><th>Wazan (Weight)</th><th class="r">KG</th></tr></thead><tbody>
      <tr><td>Gross weight</td><td class="r">${fmt(p.gross_wt, 2)}</td></tr>
      <tr><td>Tare weight (khali)</td><td class="r">− ${fmt(p.tare_wt, 2)}</td></tr>
      ${Number(p.bag_wt_kg) ? `<tr><td>Bardana katoti (${fmt(p.bags)} × ${fmt(p.bag_wt_kg, 2)} kg)</td><td class="r">− ${fmt(c.bagDeduction, 2)}</td></tr>` : ''}
      ${Number(p.deduction_kg) ? `<tr><td>Namee / quality katoti</td><td class="r">− ${fmt(p.deduction_kg, 2)}</td></tr>` : ''}
      <tr class="tot"><td>Net weight</td><td class="r">${fmt(net, 2)} kg = ${fmt(kgToMaund(net), 2)} maund</td></tr>
    </tbody></table>` +
    (Number(p.moisture_pct) || Number(p.broken_pct) || Number(p.fm_pct)
      ? `<div style="margin:-4px 0 10px;color:#555">Moisture ${fmt(p.moisture_pct, 1)}% · Broken ${fmt(p.broken_pct, 1)}% · Foreign matter ${fmt(p.fm_pct, 1)}%</div>` : '') +
    `<table><thead><tr><th>Hisaab</th><th class="r">Rupay</th></tr></thead><tbody>
      <tr><td>${fmt(kgToMaund(net), 2)} maund × ${rs(p.rate_per_maund)} per maund</td><td class="r">${rs(amount)}</td></tr>
      ${commission ? `<tr><td>Arhti commission (${fmt(p.commission_pct, 2)}%)</td><td class="r">+ ${rs(commission)}</td></tr>` : ''}
      ${Number(p.labor_charges) ? `<tr><td>Mazdoori katoti</td><td class="r">− ${rs(p.labor_charges)}</td></tr>` : ''}
      <tr class="tot"><td>Kul raqam (khata mein jama)</td><td class="r">${rs(total)}</td></tr>
      ${Number(p.advance_applied) ? `<tr><td>Mauqa par adaigi (cash)</td><td class="r">− ${rs(p.advance_applied)}</td></tr>` : ''}
      <tr class="tot"><td class="big">Baqaya (Balance)</td><td class="r big">${rs(balance)}</td></tr>
    </tbody></table>` +
    `<div class="words">${esc(rupeesInWords(total))}</div>` +
    (p.notes ? `<div>Note: ${esc(p.notes)}</div>` : '') +
    `<div class="sign"><div>Munshi</div><div>Farokht kunanda (Seller)</div><div>Gate / Kanta</div></div>` +
    footer(settings);
  return openPrint(`Slip ${p.slip_no || ''}`, body);
}

// ---------------------------------------------------------------- Sale invoice
const UNIT_TEXT = { maund: 'per maund (40 kg)', kg: 'per kg', mt: 'per metric ton' };

function exportBlock(s) {
  const rows = [
    s.buyer_ref ? ['Buyer PO / Contract', esc(s.buyer_ref)] : null,
    s.lc_no ? ['LC #', esc(s.lc_no)] : null,
    s.payment_terms ? ['Payment terms', esc(s.payment_terms)] : null,
    s.port_loading ? ['Port of loading', esc(s.port_loading)] : null,
    s.port_discharge ? ['Port of discharge', esc(s.port_discharge)] : null,
    s.destination ? ['Final destination', esc(s.destination)] : null,
    s.vessel ? ['Vessel / Voyage', esc(s.vessel)] : null,
    s.bl_no ? ['B/L #', esc(s.bl_no)] : null,
    s.container_no ? ['Container #', esc(s.container_no)] : null,
    s.shipment_date ? ['Shipment date', esc(fmtDate(s.shipment_date))] : null,
  ].filter(Boolean);
  return rows.length ? kv(rows) : '';
}

export function printSaleInvoice(s, settings, party) {
  const c = saleCalc(s);
  const cur = s.currency || 'PKR';
  const foreign = cur !== 'PKR';
  const amountFc = Number(s.amount_fc ?? c.amountFc);
  const amount = Number(s.amount ?? c.amount);
  const tax = Number(s.tax_amount ?? c.taxAmount);
  const net = Number(s.net_amount ?? c.netAmount);
  const received = Number(s.received_now || 0);
  const unit = UNIT_TEXT[s.rate_unit] || UNIT_TEXT.kg;
  const title = s.type === 'Export' ? 'Commercial Invoice' : 'Sale Invoice';
  const body = header(settings, title, s.invoice_no ? 'Invoice # ' + s.invoice_no : 'Invoice # (sync ke baad)') +
    kv([
      ['Tareekh', esc(fmtDate(s.date))],
      [s.type === 'Export' ? 'Buyer / Consignee' : 'Customer', esc(s.customer)],
      party?.address ? ['Pata', esc(party.address)] : null,
      party?.phone ? ['Phone', esc(party.phone)] : null,
      s.vehicle_no ? ['Gaari #', esc(s.vehicle_no)] : null,
    ]) +
    (s.type === 'Export' ? exportBlock(s) : '') +
    `<table><thead><tr><th>Description</th><th class="r">Bags</th><th class="r">Net wt (kg)</th><th class="r">${s.rate_unit === 'mt' ? 'MT' : 'Maund'}</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>
      <tr><td>${esc(s.item)}${s.variety ? ' — ' + esc(s.variety) : ''}${s.packing ? '<div style="color:#666;font-size:10.5px">' + esc(s.packing) + '</div>' : ''}</td>
      <td class="r">${s.bags ? fmt(s.bags) : '—'}</td><td class="r">${fmt(s.qty_kg, 2)}</td>
      <td class="r">${s.rate_unit === 'mt' ? fmt(Number(s.qty_kg) / 1000, 3) : fmt(kgToMaund(s.qty_kg), 2)}</td>
      <td class="r">${esc(money(s.rate, cur))} <span style="color:#666;font-size:10.5px">${unit}</span></td>
      <td class="r">${esc(money(foreign ? amountFc : amount, cur))}</td></tr>
      ${foreign ? `<tr><td colspan="5" class="r">Exchange rate: 1 ${esc(cur)} = Rs ${fmt(s.fx_rate, 4)}</td><td class="r">${rs(amount)}</td></tr>` : ''}
      ${tax ? `<tr><td colspan="5" class="r">Sales Tax / GST (${fmt(s.tax_pct, 2)}%)</td><td class="r">${rs(tax)}</td></tr>` : ''}
      <tr class="tot"><td colspan="5" class="r big">Total${foreign ? ' (PKR)' : ''}</td><td class="r big">${rs(net)}</td></tr>
      ${received ? `<tr><td colspan="5" class="r">Wasool (received)</td><td class="r">− ${rs(received)}</td></tr>
      <tr class="tot"><td colspan="5" class="r">Baqaya (balance due)</td><td class="r">${rs(net - received)}</td></tr>` : ''}
    </tbody></table>` +
    (foreign ? `<div class="words">${esc(cur)} ${esc(fmt(amountFc, 2))} — ${esc(rupeesInWords(net))}</div>` : `<div class="words">${esc(rupeesInWords(net))}</div>`) +
    (s.notes ? `<div>Note: ${esc(s.notes)}</div>` : '') +
    `<div class="sign"><div>Prepared by</div><div>${s.type === 'Export' ? 'Buyer' : 'Customer'}</div><div>For ${esc(settings?.mill_name || 'Mill')}</div></div>` +
    footer(settings);
  return openPrint(`Invoice ${s.invoice_no || ''}`, body);
}

export function printPackingList(s, settings, party) {
  const net = Number(s.qty_kg) || 0;
  const gross = Number(s.gross_weight_kg) || 0;
  const bags = Number(s.bags) || 0;
  const body = header(settings, 'Packing List', s.invoice_no ? 'Invoice # ' + s.invoice_no : '') +
    kv([
      ['Tareekh', esc(fmtDate(s.date))],
      ['Buyer / Consignee', esc(s.customer)],
      party?.address ? ['Pata', esc(party.address)] : null,
    ]) + exportBlock(s) +
    `<table><thead><tr><th>Description</th><th>Packing</th><th class="r">Bags</th><th class="r">Net wt (kg)</th><th class="r">Gross wt (kg)</th><th class="r">Net wt / bag</th></tr></thead><tbody>
      <tr><td>${esc(s.item)}${s.variety ? ' — ' + esc(s.variety) : ''}</td><td>${esc(s.packing || '—')}</td><td class="r">${bags ? fmt(bags) : '—'}</td>
      <td class="r">${fmt(net, 2)}</td><td class="r">${gross ? fmt(gross, 2) : '—'}</td><td class="r">${bags ? fmt(net / bags, 2) : '—'}</td></tr>
      <tr class="tot"><td colspan="3">Total</td><td class="r">${fmt(net, 2)} kg (${fmt(net / 1000, 3)} MT)</td><td class="r">${gross ? fmt(gross, 2) + ' kg' : '—'}</td><td></td></tr>
    </tbody></table>` +
    `<div class="sign"><div>Prepared by</div><div>Checked by</div><div>For ${esc(settings?.mill_name || 'Mill')}</div></div>` +
    footer(settings);
  return openPrint(`Packing List ${s.invoice_no || ''}`, body);
}

export function printDeliveryChallan(s, settings, party) {
  const body = header(settings, 'Delivery Challan / Gate Pass', s.invoice_no ? 'Ref: ' + s.invoice_no : '') +
    kv([
      ['Tareekh', esc(fmtDate(s.date))],
      ['Customer', esc(s.customer)],
      party?.address ? ['Pata', esc(party.address)] : null,
      ['Gaari #', `<span class="big">${esc(s.vehicle_no || '—')}</span>`],
      s.container_no ? ['Container #', esc(s.container_no)] : null,
    ]) +
    `<table><thead><tr><th>Maal</th><th>Packing</th><th class="r">Bags</th><th class="r">Wazan (kg)</th><th class="r">Maund</th></tr></thead><tbody>
      <tr><td>${esc(s.item)}${s.variety ? ' — ' + esc(s.variety) : ''}</td><td>${esc(s.packing || '—')}</td><td class="r">${s.bags ? fmt(s.bags) : '—'}</td>
      <td class="r">${fmt(s.qty_kg, 2)}</td><td class="r">${fmt(kgToMaund(s.qty_kg), 2)}</td></tr>
    </tbody></table>
    <div class="note" style="color:#666">Yeh parchi sirf maal ki rawangi ke liye hai — is par rate/raqam nahi.</div>` +
    `<div class="sign"><div>Godown incharge</div><div>Gate</div><div>Driver</div><div>Wasool kunanda</div></div>` +
    footer(settings);
  return openPrint(`Gate Pass ${s.invoice_no || ''}`, body);
}

// ---------------------------------------------------------------- Sauda (proforma / purchase order)
export function printContract(c, settings, party, delivered) {
  const v = contractValue(c);
  const cur = c.currency || 'PKR';
  const done = Number(delivered || 0);
  const body = header(settings, c.kind === 'sale' ? 'Proforma Invoice / Sale Contract' : 'Purchase Contract (Sauda)', c.contract_no || '') +
    kv([
      ['Tareekh', esc(fmtDate(c.date))],
      [c.kind === 'sale' ? 'Buyer' : 'Seller', `${esc(c.party_name)} <span style="color:#666">(${esc(c.party_type)})</span>`],
      party?.address ? ['Pata', esc(party.address)] : null,
      party?.phone ? ['Phone', esc(party.phone)] : null,
      c.delivery_from || c.delivery_to ? ['Delivery', `${esc(c.delivery_from ? fmtDate(c.delivery_from) : '—')} se ${esc(c.delivery_to ? fmtDate(c.delivery_to) : '—')} tak`] : null,
      c.payment_terms ? ['Payment terms', esc(c.payment_terms)] : null,
    ]) +
    `<table><thead><tr><th>Description</th><th class="r">Miqdar</th><th class="r">Rate</th><th class="r">Value</th></tr></thead><tbody>
      <tr><td>${esc(c.item)}${c.variety ? ' — ' + esc(c.variety) : ''}</td>
      <td class="r">${fmt(c.qty_kg, 0)} kg<div style="color:#666;font-size:10.5px">${fmt(rateUnits(c.qty_kg, c.rate_unit), 3)} ${c.rate_unit === 'mt' ? 'MT' : c.rate_unit === 'maund' ? 'maund' : 'kg'}</div></td>
      <td class="r">${esc(money(c.rate, cur))} <span style="color:#666;font-size:10.5px">${UNIT_TEXT[c.rate_unit] || ''}</span></td>
      <td class="r">${esc(money(v.fc, cur))}</td></tr>
      ${cur !== 'PKR' ? `<tr><td colspan="3" class="r">PKR (1 ${esc(cur)} = Rs ${fmt(c.fx_rate, 4)})</td><td class="r">${rs(v.pkr)}</td></tr>` : ''}
      ${done ? `<tr><td colspan="3" class="r">Ab tak ${c.kind === 'sale' ? 'rawana' : 'wasool'}</td><td class="r">${fmt(done, 0)} kg</td></tr>
      <tr class="tot"><td colspan="3" class="r">Baqi</td><td class="r">${fmt(Math.max(Number(c.qty_kg) - done, 0), 0)} kg</td></tr>` : ''}
    </tbody></table>` +
    (c.notes ? `<div>Note: ${esc(c.notes)}</div>` : '') +
    `<div class="sign"><div>For ${esc(settings?.mill_name || 'Mill')}</div><div>${c.kind === 'sale' ? 'Buyer' : 'Seller'}</div></div>` +
    footer(settings);
  return openPrint(c.contract_no || 'Contract', body);
}

// ---------------------------------------------------------------- Kanta slip
export function printWeighment(w, settings) {
  const body = header(settings, 'Kanta Slip (Weighbridge)', w.slip_no || '') +
    kv([
      ['Tareekh', esc(fmtDate(w.date))],
      ['Gaari #', `<span class="big">${esc(w.vehicle_no)}</span>`],
      w.party_name ? ['Party', esc(w.party_name)] : null,
      w.item ? ['Maal', esc(w.item)] : null,
      ['Qisam', esc(w.kind)],
    ]) +
    `<table><thead><tr><th>Wazan</th><th class="r">KG</th><th>Waqt</th></tr></thead><tbody>
      <tr><td>Pehla wazan (First)</td><td class="r">${fmt(w.first_wt, 2)}</td><td>${esc(fmtDateTime(w.first_at))}</td></tr>
      <tr><td>Doosra wazan (Second)</td><td class="r">${w.second_wt != null ? fmt(w.second_wt, 2) : '—'}</td><td>${esc(w.second_at ? fmtDateTime(w.second_at) : '—')}</td></tr>
      <tr class="tot"><td class="big">Net wazan</td><td class="r big">${fmt(w.net_wt, 2)}</td><td>${fmt(kgToMaund(w.net_wt), 2)} maund</td></tr>
      ${Number(w.fee) ? `<tr><td>Kanta fee</td><td class="r">${rs(w.fee)}</td><td></td></tr>` : ''}
    </tbody></table>` +
    (w.notes ? `<div>Note: ${esc(w.notes)}</div>` : '') +
    `<div class="sign"><div>Kanta operator</div><div>Driver</div></div>` +
    footer(settings);
  return openPrint(w.slip_no || 'Kanta Slip', body);
}

// ---------------------------------------------------------------- Receipt
export function printPaymentReceipt(p, settings) {
  const received = p.direction === 'Received';
  const body = header(settings, received ? 'Wasooli Raseed (Receipt)' : 'Adaigi Voucher (Payment)', fmtDate(p.date)) +
    kv([
      [received ? 'Wasool kiya (from)' : 'Ada kiya (to)', `${esc(p.party_name)} <span style="color:#666">(${esc(p.party_type)})</span>`],
      ['Raqam', `<span class="big">${rs(p.amount)}</span>`],
      ['Alfaz mein', esc(rupeesInWords(p.amount))],
      ['Tareeqa', esc(p.method) + (p.cheque_no ? ' #' + esc(p.cheque_no) : '') + (p.bank_name ? ' — ' + esc(p.bank_name) : '')],
      p.method === 'Cheque' ? ['Cheque date / status', esc(fmtDate(p.due_date)) + ' — ' + esc(p.status)] : null,
      p.notes ? ['Note', esc(p.notes)] : null,
    ]) +
    `<div class="sign"><div>${received ? 'Wasool kunanda (Mill)' : 'Ada kunanda (Mill)'}</div><div>${received ? 'Dene wala' : 'Lene wala'}</div></div>` +
    footer(settings);
  return openPrint('Receipt', body);
}

// ---------------------------------------------------------------- Statement
export function printStatement({ partyType, partyName, party, rows, from, to }, settings) {
  const closing = rows.length ? Number(rows[rows.length - 1].balance) : 0;
  const side = balanceSide(closing);
  let dr = 0;
  let cr = 0;
  const body = header(settings, 'Khata Statement', `${from ? fmtDate(from) : 'Shuru se'} — ${to ? fmtDate(to) : 'Aaj tak'}`) +
    kv([
      ['Party', `${esc(partyName)} <span style="color:#666">(${esc(partyType)})</span>`],
      party?.phone ? ['Phone', esc(party.phone)] : null,
      party?.address ? ['Pata', esc(party.address)] : null,
    ]) +
    `<table><thead><tr><th>Tareekh</th><th>Tafseel</th><th class="r">Banam (Debit)</th><th class="r">Jama (Credit)</th><th class="r">Balance</th></tr></thead><tbody>
    ${rows.map((r) => {
      dr += Number(r.debit) || 0;
      cr += Number(r.credit) || 0;
      const b = Number(r.balance) || 0;
      return `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.description)}</td><td class="r">${Number(r.debit) ? rs(r.debit) : ''}</td>
        <td class="r">${Number(r.credit) ? rs(r.credit) : ''}</td><td class="r ${b < 0 ? 'neg' : ''}">${rs(Math.abs(b))} ${b > 0 ? 'Jama' : b < 0 ? 'Banam' : ''}</td></tr>`;
    }).join('')}
    <tr class="tot"><td colspan="2">Total</td><td class="r">${rs(dr)}</td><td class="r">${rs(cr)}</td><td class="r">${rs(Math.abs(closing))}</td></tr>
    </tbody></table>
    <div class="big">Closing balance: ${rs(Math.abs(closing))} — ${esc(side.long)}</div>` +
    footer(settings);
  return openPrint(`Statement ${partyName}`, body);
}

// ---------------------------------------------------------------- generic table
// columns: [{ label, right? }], rows: [[cell, ...]] (cells are plain text)
export function printTable({ title, subtitle, columns, rows, totals, notes }, settings) {
  const body = header(settings, title, subtitle) +
    `<table><thead><tr>${columns.map((c) => `<th class="${c.right ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${columns[i]?.right ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
    ${totals ? `<tr class="tot">${totals.map((v, i) => `<td class="${columns[i]?.right ? 'r' : ''}">${esc(v)}</td>`).join('')}</tr>` : ''}
    </tbody></table>` +
    (notes ? `<div style="color:#555">${esc(notes)}</div>` : '') +
    footer(settings);
  return openPrint(title, body);
}
