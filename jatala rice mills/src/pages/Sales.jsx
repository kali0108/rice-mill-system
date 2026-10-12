import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties, useSettings, useCatalog } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { saleCalc, num, fmt, fmtNum, rs, kgToMaund, sum, money } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { CURRENCIES, RATE_UNITS, RATE_UNIT_SHORT, PAYMENT_TERMS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printSaleInvoice, printPackingList, printDeliveryChallan, printTable } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, VarietySelect, ProductSelect, ListInput, BalanceHint, DateRangeBar, SearchBox, matchesSearch,
  useShowMore, FormActions, RowActions, Empty, PendingTag, StatCard, confirmDelete, SyncNote,
} from '../components/ui';

const EXPORT_FIELDS = ['buyer_ref', 'destination', 'port_loading', 'port_discharge', 'vessel', 'bl_no', 'lc_no', 'payment_terms', 'packing', 'container_no'];

const blank = (prev) => ({
  date: prev?.date || todayStr(), invoice_no: '', customer: '', type: prev?.type || 'Local', item: prev?.item || 'Rice - Full Grain',
  variety: prev?.variety || '', bags: '', qty_kg: '', rate_unit: prev?.rate_unit || 'maund', rate: '', tax_pct: '',
  received_now: '', vehicle_no: '', shipment_date: '', notes: '', currency: prev?.currency || 'PKR', fx_rate: prev?.fx_rate || '',
  gross_weight_kg: '', contract_id: '', ...Object.fromEntries(EXPORT_FIELDS.map((f) => [f, ''])),
});

function toForm(s) {
  const v = (x) => (x == null || Number(x) === 0 ? '' : String(x));
  return {
    date: s.date, invoice_no: s.invoice_no || '', customer: s.customer, type: s.type || 'Local', item: s.item, variety: s.variety || '',
    bags: v(s.bags), qty_kg: v(s.qty_kg), rate_unit: ['maund', 'mt'].includes(s.rate_unit) ? s.rate_unit : 'kg', rate: v(s.rate), tax_pct: v(s.tax_pct),
    received_now: v(s.received_now), vehicle_no: s.vehicle_no || '', shipment_date: s.shipment_date || '', notes: s.notes || '',
    currency: s.currency || 'PKR', fx_rate: s.currency && s.currency !== 'PKR' ? v(s.fx_rate) : '', gross_weight_kg: v(s.gross_weight_kg),
    contract_id: s.contract_id || '', ...Object.fromEntries(EXPORT_FIELDS.map((f) => [f, s[f] || ''])),
  };
}

export default function Sales() {
  const range = useDateRange('sales', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('sales', { from: range.from, to: range.to });
  const stock = useRpc('get_stock_summary', {}, { watch: WATCH.stock });
  const contracts = useSupaTable('contracts', { eq: { kind: 'sale', status: 'Open' }, orderBy: 'date' });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { canonicalName, findParty } = useParties();
  const { hasVariety: productHasVariety, productByName } = useCatalog();
  const toast = useToast();
  const writable = canWrite(profile, 'sales');

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const c = saleCalc(form);
  const hasVariety = productHasVariety(form.item);
  const isExport = form.type === 'Export';

  const available = useMemo(() => {
    const v = hasVariety ? form.variety.trim() : '';
    const line = (stock.data || []).find((s) => s.item === form.item && s.variety === v);
    return line ? Number(line.balance_kg) : 0;
  }, [stock.data, form.item, form.variety, hasVariety]);

  const customerContracts = useMemo(() => {
    const k = form.customer.trim().toLowerCase();
    return contracts.rows.filter((ct) => !k || ct.party_name.toLowerCase() === k);
  }, [contracts.rows, form.customer]);

  function pickContract(id) {
    const ct = contracts.rows.find((x) => x.id === id);
    if (!ct) { setForm((f) => ({ ...f, contract_id: '' })); return; }
    setForm((f) => ({
      ...f, contract_id: id, customer: ct.party_name, item: ct.item, variety: ct.variety || '', rate: String(ct.rate), rate_unit: ct.rate_unit,
      currency: ct.currency || 'PKR', fx_rate: ct.currency && ct.currency !== 'PKR' ? String(ct.fx_rate) : '',
      type: ct.currency && ct.currency !== 'PKR' ? 'Export' : f.type, payment_terms: ct.payment_terms || f.payment_terms,
    }));
  }

  const filtered = useMemo(() => rows.filter((s) => matchesSearch(q, s.invoice_no, s.customer, s.item, s.variety, s.vehicle_no, s.container_no, s.bl_no, s.lc_no, s.notes)), [rows, q]);
  const [visible, more] = useShowMore(filtered);
  const totKg = sum(filtered, 'qty_kg');
  const totNet = sum(filtered, 'net_amount');
  const totTax = sum(filtered, 'tax_amount');
  const totRecv = sum(filtered, 'received_now');

  async function save(andPrint) {
    if (saving) return;
    if (!form.customer.trim()) return toast.error('Customer ka naam likhein.');
    if (num(form.qty_kg) <= 0) return toast.error('Quantity (kg) likhein.');
    if (form.currency !== 'PKR' && num(form.fx_rate) <= 0) return toast.error(`Exchange rate likhein (1 ${form.currency} = kitne Rs).`);
    if (num(form.rate) <= 0 && !window.confirm('Rate 0 hai. Phir bhi save karein?')) return;
    if (num(form.received_now) > c.netAmount && !window.confirm('Wasool raqam bill se zyada hai. Phir bhi save karein?')) return;
    if (!editingId && num(form.qty_kg) > available + 0.01 &&
      !window.confirm(`Stock mein ${form.item}${hasVariety && form.variety ? ' (' + form.variety + ')' : ''} sirf ${fmtNum(available)} kg hai. Phir bhi bill banayein?`)) return;
    const payload = {
      date: form.date, invoice_no: form.invoice_no.trim(), customer: canonicalName('Customer', form.customer), type: form.type,
      item: form.item, variety: hasVariety ? form.variety.trim() : '', bags: Math.round(num(form.bags)), qty_kg: num(form.qty_kg),
      rate_unit: form.rate_unit, rate: num(form.rate), tax_pct: num(form.tax_pct), currency: form.currency,
      fx_rate: form.currency === 'PKR' ? 1 : num(form.fx_rate), amount_fc: c.amountFc, amount: c.amount, tax_amount: c.taxAmount,
      net_amount: c.netAmount, received_now: num(form.received_now), vehicle_no: form.vehicle_no.trim().toUpperCase(),
      shipment_date: isExport && form.shipment_date ? form.shipment_date : null, notes: form.notes.trim(),
      gross_weight_kg: isExport ? num(form.gross_weight_kg) : 0, contract_id: form.contract_id || null,
      ...Object.fromEntries(EXPORT_FIELDS.map((f) => [f, isExport || f === 'payment_terms' ? String(form[f] || '').trim() : ''])),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success(res.queued ? 'Offline save — sync baad mein hogi.' : `Bill save ho gaya${res.data?.invoice_no ? ' — ' + res.data.invoice_no : ''}.`);
    if (andPrint) printSaleInvoice(res.data || payload, settings, findParty('Customer', payload.customer));
    setEditingId(null);
    setForm(blank(editingId ? null : form));
  }

  async function del(s) {
    if (!confirmDelete(`${s.invoice_no || ''} ${s.customer}`)) return;
    const res = await remove(s.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success('Bill delete ho gaya (khata entry bhi hat gayi).');
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(totNet)} l={`Kul sale (${filtered.length} bills)`} />
        <StatCard n={`${fmtNum(totKg)} kg`} l={`${fmt(kgToMaund(totKg), 1)} maund · ${fmt(totKg / 1000, 2)} MT`} />
        <StatCard n={rs(totTax)} l="Sales tax / GST" />
        <StatCard n={rs(totNet - totRecv)} l="Bills par baqaya (mauqa wasooli ke baad)" />
      </div>

      {writable && (
        <Panel title={editingId ? 'Bill Edit Karein' : 'Naya Bill (Sale / Export)'}>
          <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label="Invoice # (khali = auto)"><input value={form.invoice_no} onChange={set('invoice_no')} placeholder="Auto" /></Field>
              <Field label="Customer"><PartyInput type="Customer" value={form.customer} onChange={set('customer')} required /></Field>
              <Field label="Sauda (contract)" hint={customerContracts.length ? 'Chunein to rate/maal khud bhar jayenge' : 'Is customer ka koi open sauda nahi'}>
                <select value={form.contract_id} onChange={(e) => pickContract(e.target.value)}>
                  <option value="">— Baghair saude ke —</option>
                  {customerContracts.map((ct) => <option key={ct.id} value={ct.id}>{ct.contract_no} · {ct.party_name} · {ct.variety || ct.item}</option>)}
                </select>
              </Field>
              <Field label="Qisam"><select value={form.type} onChange={set('type')}><option value="Local">Local sale</option><option value="Export">Export</option></select></Field>
              <Field label="Item (maal)">
                <ProductSelect
                  value={form.item}
                  required
                  onChange={(e) => {
                    const item = e.target.value;
                    const prod = productByName(item);
                    setForm((f) => ({ ...f, item, rate_unit: !editingId && prod && f.currency === 'PKR' ? prod.sale_unit || f.rate_unit : f.rate_unit }));
                  }}
                />
              </Field>
              {hasVariety && <Field label="Variety"><VarietySelect value={form.variety} onChange={set('variety')} /></Field>}
              <Field label="Bags"><NumInput step="1" value={form.bags} onChange={set('bags')} /></Field>
              <Field label="Wazan (kg)" hint={`Stock mein: ${fmtNum(available)} kg`}><NumInput value={form.qty_kg} onChange={set('qty_kg')} required /></Field>
              <Field label="Rate kis hisaab se"><select value={form.rate_unit} onChange={set('rate_unit')}>{RATE_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></Field>
              <Field label="Currency"><select value={form.currency} onChange={set('currency')}>{CURRENCIES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
              <Field label={`Rate (${form.currency} ${RATE_UNITS.find((u) => u.value === form.rate_unit)?.label.toLowerCase() || ''})`}><NumInput value={form.rate} onChange={set('rate')} required /></Field>
              {form.currency !== 'PKR' && <Field label={`1 ${form.currency} = kitne Rs`}><NumInput value={form.fx_rate} onChange={set('fx_rate')} required /></Field>}
              <Field label="Sales tax / GST %"><NumInput value={form.tax_pct} onChange={set('tax_pct')} /></Field>
              <Field label="Mauqa par wasooli (Rs)" hint="Abhi mile paise"><NumInput value={form.received_now} onChange={set('received_now')} /></Field>
              <Field label="Gaari #"><input value={form.vehicle_no} onChange={set('vehicle_no')} /></Field>
              <Field label="Payment terms"><ListInput value={form.payment_terms} onChange={set('payment_terms')} options={PAYMENT_TERMS} /></Field>
            </div>
            {isExport && (
              <div className="output-group">
                <div className="output-title">Export / shipping</div>
                <div className="form-grid">
                  <Field label="Buyer PO / contract #"><input value={form.buyer_ref} onChange={set('buyer_ref')} /></Field>
                  <Field label="LC #"><input value={form.lc_no} onChange={set('lc_no')} /></Field>
                  <Field label="Port of loading"><input value={form.port_loading} onChange={set('port_loading')} placeholder="e.g. Karachi (KICT)" /></Field>
                  <Field label="Port of discharge"><input value={form.port_discharge} onChange={set('port_discharge')} placeholder="e.g. Jebel Ali" /></Field>
                  <Field label="Final destination"><input value={form.destination} onChange={set('destination')} /></Field>
                  <Field label="Vessel / voyage"><input value={form.vessel} onChange={set('vessel')} /></Field>
                  <Field label="B/L #"><input value={form.bl_no} onChange={set('bl_no')} /></Field>
                  <Field label="Container #"><input value={form.container_no} onChange={set('container_no')} /></Field>
                  <Field label="Shipment date"><input type="date" value={form.shipment_date} onChange={set('shipment_date')} /></Field>
                  <Field label="Packing"><input value={form.packing} onChange={set('packing')} placeholder="e.g. 25 kg PP bags" /></Field>
                  <Field label="Gross weight (kg)" hint="Bori samet"><NumInput value={form.gross_weight_kg} onChange={set('gross_weight_kg')} /></Field>
                </div>
              </div>
            )}
            <Field label="Note" wide><input value={form.notes} onChange={set('notes')} /></Field>
            <div className="calcline" style={{ marginTop: 10 }}>
              {fmtNum(c.qty)} kg = <b>{fmt(c.maunds, 2)} maund</b> = <b>{fmt(c.mt, 3)} MT</b> · Raqam: <b>{money(c.amountFc, form.currency)}</b>
              {c.foreign ? <> × {fmt(c.fx, 4)} = <b>{rs(c.amount)}</b></> : null}
              {c.taxAmount ? <> · Tax: <b>{rs(c.taxAmount)}</b></> : null} · Kul bill: <b>{rs(c.netAmount)}</b>
              {num(form.received_now) ? <> · Wasool: −{rs(form.received_now)} · Baqaya: <b>{rs(c.balance)}</b></> : null}
            </div>
            <BalanceHint type="Customer" name={form.customer} />
            <FormActions
              saving={saving}
              editing={!!editingId}
              onCancel={() => { setEditingId(null); setForm(blank()); }}
              saveLabel="Bill Save Karein"
              extra={<button type="button" className="btn gold" disabled={saving} onClick={() => save(true)}>Save + Invoice Print</button>}
            />
          </form>
        </Panel>
      )}

      <Panel
        title="Sales Register"
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => printTable({
            title: 'Sales Register', subtitle: `${range.from ? fmtDate(range.from) : 'Shuru'} — ${range.to ? fmtDate(range.to) : 'Aaj'}`,
            columns: [{ label: 'Date' }, { label: 'Invoice' }, { label: 'Customer' }, { label: 'Item' }, { label: 'Kg', right: true }, { label: 'Rate', right: true }, { label: 'Tax', right: true }, { label: 'Kul (Rs)', right: true }],
            rows: filtered.map((s) => [fmtDate(s.date), s.invoice_no, s.customer, `${s.item}${s.variety ? ' (' + s.variety + ')' : ''}`, fmtNum(s.qty_kg), `${money(s.rate, s.currency)}/${RATE_UNIT_SHORT[s.rate_unit] || 'kg'}`, rs(s.tax_amount), rs(s.net_amount)]),
            totals: ['Total', '', '', '', fmtNum(totKg), '', rs(totTax), rs(totNet)],
          }, settings)}>Print</button>
          <button type="button" className="btn small" onClick={() => exportCSV('sales.csv', ['Date', 'Invoice', 'Customer', 'Type', 'Item', 'Variety', 'Bags', 'Kg', 'Rate', 'RateUnit', 'Currency', 'FX', 'AmountFC', 'AmountPKR', 'Tax', 'Net', 'Received', 'Vehicle', 'Container', 'BL', 'LC', 'Vessel', 'Notes'],
            filtered.map((s) => [s.date, s.invoice_no, s.customer, s.type, s.item, s.variety, s.bags, s.qty_kg, s.rate, s.rate_unit, s.currency, s.fx_rate, s.amount_fc, s.amount, s.tax_amount, s.net_amount, s.received_now, s.vehicle_no, s.container_no, s.bl_no, s.lc_no, s.vessel, s.notes]))}>Export CSV</button>
        </>}
      >
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder="Invoice, customer, B/L, LC…" /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Item</th><th className="r">Kg</th><th className="r">Rate</th><th className="r">Kul bill</th><th className="r">Wasool</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={9} text="Loading…" /> : visible.length ? visible.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.date)} {s._pending && <PendingTag />}</td>
                  <td>{s.invoice_no || '—'}{s.type === 'Export' ? <div className="muted">Export{s.bl_no ? ' · B/L ' + s.bl_no : ''}</div> : null}</td>
                  <td>{s.customer}</td>
                  <td>{s.item}{s.variety ? <div className="muted">{s.variety}</div> : null}</td>
                  <td className="r">{fmtNum(s.qty_kg)}</td>
                  <td className="r">{money(s.rate, s.currency)}<span className="muted">/{RATE_UNIT_SHORT[s.rate_unit] || 'kg'}</span></td>
                  <td className="r"><b>{rs(s.net_amount)}</b>{s.currency && s.currency !== 'PKR' ? <div className="muted">{money(s.amount_fc, s.currency)}</div> : null}</td>
                  <td className="r">{Number(s.received_now) ? rs(s.received_now) : '—'}</td>
                  <td>
                    <RowActions
                      onPrint={() => printSaleInvoice(s, settings, findParty('Customer', s.customer))}
                      extra={<>
                        <button type="button" className="btn small" onClick={() => printDeliveryChallan(s, settings, findParty('Customer', s.customer))}>Gate Pass</button>
                        {s.type === 'Export' ? <button type="button" className="btn small" onClick={() => printPackingList(s, settings, findParty('Customer', s.customer))}>Packing List</button> : null}
                      </>}
                      onEdit={writable ? () => { setEditingId(s.id); setForm(toForm(s)); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={writable ? () => del(s) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={9} text="Is muddat mein koi bill nahi." />}
            </tbody>
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
