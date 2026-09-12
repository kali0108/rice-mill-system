import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { laborCalc, rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, StatCard, Empty, PendingTag } from '../components/ui';

const empty = { name: '', date: todayStr(), pay_type: 'Daily', rate_or_wage: '', units_or_days: '', advance_deducted: '0' };

function toForm(l) {
  return { name: l.name, date: l.date, pay_type: l.pay_type, rate_or_wage: String(l.rate_or_wage), units_or_days: String(l.units_or_days), advance_deducted: String(l.advance_deducted ?? 0) };
}

export default function Labor() {
  const { rows, insert, remove, update } = useSupaTable('labor_entries');
  const { profile } = useAuth();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const writable = canWrite(profile, 'labor');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const totalPending = rows.filter((l) => !l.paid).reduce((s, l) => s + laborCalc(l).net, 0);

  function startEdit(l) { setEditingId(l.id); setForm(toForm(l)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEdit() { setEditingId(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const gross = Number(form.rate_or_wage) * Number(form.units_or_days);
    const net = gross - Number(form.advance_deducted || 0);
    const payload = {
      name: form.name.trim(), date: form.date, pay_type: form.pay_type, rate_or_wage: Number(form.rate_or_wage),
      units_or_days: Number(form.units_or_days), advance_deducted: Number(form.advance_deducted) || 0,
      gross, net_pay: net,
    };
    if (!editingId) payload.paid = false;
    const { error } = editingId ? await update(editingId, payload) : await insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEditingId(null);
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title={editingId ? 'Labor Entry Edit Karein' : 'Nayi Labor Entry'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Worker Name</label><input value={form.name} onChange={set('name')} required /></div>
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Pay Type</label>
                <select value={form.pay_type} onChange={set('pay_type')}><option value="Daily">Daily Wage</option><option value="Piece">Piece Rate (per bag)</option></select>
              </div>
              <div className="field"><label>{form.pay_type === 'Piece' ? 'Rate per Bag (Rs)' : 'Daily Wage (Rs)'}</label><input type="number" min="0" value={form.rate_or_wage} onChange={set('rate_or_wage')} required /></div>
              <div className="field"><label>{form.pay_type === 'Piece' ? 'Bags Done' : 'Days Worked'}</label><input type="number" step="0.1" min="0" value={form.units_or_days} onChange={set('units_or_days')} required /></div>
              <div className="field"><label>Advance Deducted (Rs)</label><input type="number" min="0" value={form.advance_deducted} onChange={set('advance_deducted')} /></div>
            </div>
            <button type="submit" className="btn primary">{editingId ? 'Update Karein' : 'Entry Save Karein'}</button>{' '}
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
          </form>
        </Panel>
      )}

      <div className="cardgrid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <StatCard n={rs(totalPending)} l="Total Pending Wages (Unpaid)" warn={totalPending > 0} />
      </div>

      <Panel title="Wage Sheet" action={<button className="btn small" onClick={() => exportCSV('labor.csv', ['Name','Date','PayType','Rate','UnitsOrDays','Gross','Advance','NetPay','Paid'], rows.map((l) => { const c = laborCalc(l); return [l.name, l.date, l.pay_type, l.rate_or_wage, l.units_or_days, c.gross.toFixed(0), l.advance_deducted, c.net.toFixed(0), l.paid ? 'Yes' : 'No']; }))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Worker</th><th>Date</th><th>Type</th><th>Rate</th><th>Days/Bags</th><th>Gross</th><th>Advance</th><th>Net Pay</th><th>Status</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((l) => {
                const c = laborCalc(l);
                return (
                  <tr key={l.id}>
                    <td>{l.name} {l._pending && <PendingTag />}</td><td>{fmtDate(l.date)}</td><td>{l.pay_type}</td>
                    <td>{rs(l.rate_or_wage)}</td><td>{l.units_or_days}</td><td>{rs(c.gross)}</td><td>{rs(l.advance_deducted)}</td>
                    <td><b>{rs(c.net)}</b></td>
                    <td><label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}><input type="checkbox" checked={l.paid} disabled={!writable} onChange={(e) => update(l.id, { paid: e.target.checked })} /> Paid</label></td>
                    {writable && <td><button className="btn small" onClick={() => startEdit(l)}>Edit</button> <button className="btn small danger" onClick={() => remove(l.id)}>Delete</button></td>}
                  </tr>
                );
              }) : <Empty colSpan={10} text="Koi labor entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
