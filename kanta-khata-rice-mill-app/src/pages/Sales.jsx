import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { saleCalc, fmt, rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Empty, PendingTag } from '../components/ui';

const ITEMS = ['Rice - Full Grain', 'Kanki/Broken', 'Bran/Chokar', 'Husk/Tuti', 'Other'];
const empty = { date: todayStr(), customer: '', type: 'Local', item: 'Rice - Full Grain', qty_kg: '', rate: '', tax_pct: '0', container_no: '', shipment_date: '' };

function toForm(s) {
  return {
    date: s.date, customer: s.customer, type: s.type, item: s.item, qty_kg: String(s.qty_kg), rate: String(s.rate),
    tax_pct: String(s.tax_pct ?? 0), container_no: s.container_no || '', shipment_date: s.shipment_date || '',
  };
}

function printInvoice(s) {
  const c = saleCalc(s);
  const win = window.open('', '_blank', 'width=700,height=800');
  if (!win) { alert('Popup blocked — apne browser mein popups allow karein.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><title>Invoice</title><style>
    body{font-family:Arial,sans-serif;padding:32px;color:#2A2621;}
    h1{font-size:22px;margin-bottom:2px;} .sub{color:#7A7264;font-size:12px;margin-bottom:24px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;} td,th{padding:8px 10px;border-bottom:1px solid #E7DFCC;text-align:left;font-size:13px;}
    th{color:#8B6544;font-size:11px;} .label{font-weight:600;width:160px;}
  </style></head><body>
    <h1>Sale Invoice</h1><div class="sub">Kanta Khata — Rice Mill Manager</div>
    <table>
      <tr><td class="label">Date</td><td>${fmtDate(s.date)}</td></tr>
      <tr><td class="label">Customer</td><td>${s.customer}</td></tr>
      <tr><td class="label">Type</td><td>${s.type}</td></tr>
      ${s.type === 'Export' ? `<tr><td class="label">Container No</td><td>${s.container_no || '—'}</td></tr><tr><td class="label">Shipment Date</td><td>${s.shipment_date ? fmtDate(s.shipment_date) : '—'}</td></tr>` : ''}
    </table>
    <table>
      <thead><tr><th>Item</th><th>Qty (kg)</th><th>Rate</th><th>Amount</th><th>Tax</th><th>Net</th></tr></thead>
      <tbody><tr><td>${s.item}</td><td>${fmt(s.qty_kg)}</td><td>${rs(s.rate)}</td><td>${rs(c.amount)}</td><td>${rs(c.taxAmount)}</td><td><b>${rs(c.netAmount)}</b></td></tr></tbody>
    </table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}

export default function Sales() {
  const { rows, insert, update, remove } = useSupaTable('sales');
  const { profile } = useAuth();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const writable = canWrite(profile, 'sales');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(s) { setEditingId(s.id); setForm(toForm(s)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEdit() { setEditingId(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const amount = Number(form.qty_kg) * Number(form.rate);
    const taxAmount = (amount * Number(form.tax_pct || 0)) / 100;
    const netAmount = amount + taxAmount;
    const payload = {
      date: form.date, customer: form.customer.trim(), type: form.type, item: form.item,
      qty_kg: Number(form.qty_kg), rate: Number(form.rate), tax_pct: Number(form.tax_pct) || 0,
      amount, tax_amount: taxAmount, net_amount: netAmount,
      container_no: form.container_no || '', shipment_date: form.shipment_date || null,
    };
    const { error } = editingId ? await update(editingId, payload) : await insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEditingId(null);
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title={editingId ? 'Sale / Bill Edit Karein' : 'Nayi Sale / Bill'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Customer</label><input value={form.customer} onChange={set('customer')} required /></div>
              <div className="field"><label>Type</label>
                <select value={form.type} onChange={set('type')}><option value="Local">Local Sale</option><option value="Export">Export</option></select>
              </div>
              <div className="field"><label>Item</label><select value={form.item} onChange={set('item')}>{ITEMS.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
              <div className="field"><label>Quantity (kg)</label><input type="number" step="0.1" min="0" value={form.qty_kg} onChange={set('qty_kg')} required /></div>
              <div className="field"><label>Rate (Rs / kg)</label><input type="number" step="0.1" min="0" value={form.rate} onChange={set('rate')} required /></div>
              <div className="field"><label>Tax % (Sales Tax/GST)</label><input type="number" step="0.1" min="0" value={form.tax_pct} onChange={set('tax_pct')} /></div>
              {form.type === 'Export' && <>
                <div className="field"><label>Container Number</label><input value={form.container_no} onChange={set('container_no')} /></div>
                <div className="field"><label>Shipment Date</label><input type="date" value={form.shipment_date} onChange={set('shipment_date')} /></div>
              </>}
            </div>
            <button type="submit" className="btn primary">{editingId ? 'Update Karein' : 'Bill Save Karein'}</button>{' '}
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Sales Register" action={<button className="btn small" onClick={() => exportCSV('sales.csv', ['Date','Customer','Type','Item','Qty(kg)','Rate','Amount','Tax','NetAmount'], rows.map((s) => { const c = saleCalc(s); return [s.date, s.customer, s.type, s.item, s.qty_kg, s.rate, c.amount.toFixed(0), c.taxAmount.toFixed(0), c.netAmount.toFixed(0)]; }))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Item</th><th>Qty (kg)</th><th>Rate</th><th>Amount</th><th>Tax</th><th>Net Amount</th><th></th></tr></thead>
            <tbody>
              {rows.length ? rows.map((s) => {
                const c = saleCalc(s);
                return (
                  <tr key={s.id}>
                    <td>{fmtDate(s.date)} {s._pending && <PendingTag />}</td><td>{s.customer}</td><td>{s.type}</td><td>{s.item}</td>
                    <td>{fmt(s.qty_kg)}</td><td>{rs(s.rate)}</td><td>{rs(c.amount)}</td><td>{rs(c.taxAmount)}</td>
                    <td><b>{rs(c.netAmount)}</b></td>
                    <td>
                      <button className="btn small" onClick={() => printInvoice(s)}>Print</button>{' '}
                      {writable && <><button className="btn small" onClick={() => startEdit(s)}>Edit</button>{' '}
                      <button className="btn small danger" onClick={() => remove(s.id)}>Delete</button></>}
                    </td>
                  </tr>
                );
              }) : <Empty colSpan={10} text="Koi sale entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
