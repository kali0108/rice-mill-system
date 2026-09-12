import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { fmt, rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Empty, PendingTag } from '../components/ui';

const TYPES = ['Loading', 'Unloading', 'Delivery', 'Arhti Commission'];
const empty = { date: todayStr(), entry_type: 'Delivery', vehicle_no: '', driver_name: '', from_location: '', to_location: '', item: '', qty_kg: '0', freight_rate_per_kg: '0', commission_base_amount: '0', commission_pct: '0', notes: '' };

function toForm(t) {
  return {
    date: t.date, entry_type: t.entry_type, vehicle_no: t.vehicle_no || '', driver_name: t.driver_name || '',
    from_location: t.from_location || '', to_location: t.to_location || '', item: t.item || '',
    qty_kg: String(t.qty_kg ?? 0), freight_rate_per_kg: String(t.freight_rate_per_kg ?? 0),
    commission_base_amount: String(t.commission_base_amount ?? 0), commission_pct: String(t.commission_pct ?? 0),
    notes: t.notes || '',
  };
}

export default function Transport() {
  const { rows, insert, update, remove } = useSupaTable('transport_entries');
  const { profile } = useAuth();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const writable = canWrite(profile, 'transport');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(t) { setEditingId(t.id); setForm(toForm(t)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEdit() { setEditingId(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const freightAmount = Number(form.qty_kg || 0) * Number(form.freight_rate_per_kg || 0);
    const commissionAmount = (Number(form.commission_base_amount || 0) * Number(form.commission_pct || 0)) / 100;
    const payload = {
      date: form.date, entry_type: form.entry_type, vehicle_no: form.vehicle_no, driver_name: form.driver_name,
      from_location: form.from_location, to_location: form.to_location, item: form.item,
      qty_kg: Number(form.qty_kg) || 0, freight_rate_per_kg: Number(form.freight_rate_per_kg) || 0, freight_amount: freightAmount,
      commission_base_amount: Number(form.commission_base_amount) || 0, commission_pct: Number(form.commission_pct) || 0,
      commission_amount: commissionAmount, notes: form.notes,
    };
    const { error } = editingId ? await update(editingId, payload) : await insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEditingId(null);
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title={editingId ? 'Transport Entry Edit Karein' : 'Nayi Transport Entry'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Type</label><select value={form.entry_type} onChange={set('entry_type')}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>Vehicle Number</label><input value={form.vehicle_no} onChange={set('vehicle_no')} placeholder="e.g. LES-4021" /></div>
              <div className="field"><label>Driver Name</label><input value={form.driver_name} onChange={set('driver_name')} /></div>
              <div className="field"><label>From</label><input value={form.from_location} onChange={set('from_location')} /></div>
              <div className="field"><label>To</label><input value={form.to_location} onChange={set('to_location')} /></div>
              <div className="field"><label>Item</label><input value={form.item} onChange={set('item')} placeholder="e.g. Rice bags" /></div>
              <div className="field"><label>Quantity (kg)</label><input type="number" min="0" value={form.qty_kg} onChange={set('qty_kg')} /></div>
              <div className="field"><label>Freight Rate (Rs/kg)</label><input type="number" step="0.01" min="0" value={form.freight_rate_per_kg} onChange={set('freight_rate_per_kg')} /></div>
              <div className="field"><label>Commission Base Amount (Rs)</label><input type="number" min="0" value={form.commission_base_amount} onChange={set('commission_base_amount')} /></div>
              <div className="field"><label>Arhti Commission %</label><input type="number" step="0.1" min="0" value={form.commission_pct} onChange={set('commission_pct')} /></div>
              <div className="field"><label>Notes</label><input value={form.notes} onChange={set('notes')} /></div>
            </div>
            <button type="submit" className="btn primary">{editingId ? 'Update Karein' : 'Entry Save Karein'}</button>{' '}
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Transport / Logistics Register" action={<button className="btn small" onClick={() => exportCSV('transport.csv', ['Date','Type','Vehicle','Driver','From','To','Item','Qty(kg)','FreightRate','FreightAmount','CommissionBase','Commission%','CommissionAmount','Notes'], rows.map((t) => [t.date, t.entry_type, t.vehicle_no, t.driver_name, t.from_location, t.to_location, t.item, t.qty_kg, t.freight_rate_per_kg, t.freight_amount, t.commission_base_amount, t.commission_pct, t.commission_amount, t.notes]))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Type</th><th>Vehicle</th><th>Route</th><th>Item</th><th>Qty</th><th>Freight</th><th>Commission</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)} {t._pending && <PendingTag />}</td><td>{t.entry_type}</td><td>{t.vehicle_no || '—'}</td>
                  <td>{t.from_location || '—'} → {t.to_location || '—'}</td><td>{t.item || '—'}</td><td>{fmt(t.qty_kg)} kg</td>
                  <td>{rs(t.freight_amount)}</td><td>{t.commission_amount ? rs(t.commission_amount) : '—'}</td>
                  {writable && <td><button className="btn small" onClick={() => startEdit(t)}>Edit</button> <button className="btn small danger" onClick={() => remove(t.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={9} text="Koi transport entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
