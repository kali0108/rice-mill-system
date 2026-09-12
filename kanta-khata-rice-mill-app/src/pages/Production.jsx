import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { productionCalc, fmt, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Empty, PendingTag } from '../components/ui';

const empty = { date: todayStr(), lot_no: '', process: 'Raw', paddy_input_kg: '', rice_output_kg: '', kanki25: '0', kanki50: '0', kanki100: '0', bran_kg: '0', husk_kg: '0', wastage_kg: '0' };

function toForm(b) {
  return {
    date: b.date, lot_no: b.lot_no, process: b.process, paddy_input_kg: String(b.paddy_input_kg), rice_output_kg: String(b.rice_output_kg),
    kanki25: String(b.kanki25 ?? 0), kanki50: String(b.kanki50 ?? 0), kanki100: String(b.kanki100 ?? 0),
    bran_kg: String(b.bran_kg ?? 0), husk_kg: String(b.husk_kg ?? 0), wastage_kg: String(b.wastage_kg ?? 0),
  };
}

export default function Production() {
  const { rows, insert, update, remove } = useSupaTable('production_batches');
  const { profile } = useAuth();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const writable = canWrite(profile, 'production');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(b) { setEditingId(b.id); setForm(toForm(b)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEdit() { setEditingId(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const paddyInputKg = Number(form.paddy_input_kg);
    const totalRice = Number(form.rice_output_kg) + Number(form.kanki25 || 0) + Number(form.kanki50 || 0) + Number(form.kanki100 || 0);
    const recoveryPct = paddyInputKg ? (totalRice / paddyInputKg) * 100 : 0;
    const payload = {
      date: form.date, lot_no: form.lot_no.trim(), process: form.process, paddy_input_kg: paddyInputKg,
      rice_output_kg: Number(form.rice_output_kg), kanki25: Number(form.kanki25) || 0, kanki50: Number(form.kanki50) || 0,
      kanki100: Number(form.kanki100) || 0, bran_kg: Number(form.bran_kg) || 0, husk_kg: Number(form.husk_kg) || 0,
      wastage_kg: Number(form.wastage_kg) || 0, recovery_pct: recoveryPct,
    };
    const { error } = editingId ? await update(editingId, payload) : await insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEditingId(null);
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title={editingId ? 'Production Batch Edit Karein' : 'Naya Production Batch'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Lot Number</label><input value={form.lot_no} onChange={set('lot_no')} required placeholder="e.g. LOT-104" /></div>
              <div className="field"><label>Process</label>
                <select value={form.process} onChange={set('process')}>
                  <option value="Raw">Raw Milling</option>
                  <option value="Sella">Parboiled / Sella</option>
                </select>
              </div>
              <div className="field"><label>Paddy Input (kg)</label><input type="number" step="0.1" min="0" value={form.paddy_input_kg} onChange={set('paddy_input_kg')} required /></div>
              <div className="field"><label>Rice Output — Full Grain (kg)</label><input type="number" step="0.1" min="0" value={form.rice_output_kg} onChange={set('rice_output_kg')} required /></div>
              <div className="field"><label>Kanki 25% Broken (kg)</label><input type="number" step="0.1" min="0" value={form.kanki25} onChange={set('kanki25')} /></div>
              <div className="field"><label>Kanki 50% Broken (kg)</label><input type="number" step="0.1" min="0" value={form.kanki50} onChange={set('kanki50')} /></div>
              <div className="field"><label>Kanki 100% Broken (kg)</label><input type="number" step="0.1" min="0" value={form.kanki100} onChange={set('kanki100')} /></div>
              <div className="field"><label>Chokar/Bran (kg)</label><input type="number" step="0.1" min="0" value={form.bran_kg} onChange={set('bran_kg')} /></div>
              <div className="field"><label>Tuti/Husk (kg)</label><input type="number" step="0.1" min="0" value={form.husk_kg} onChange={set('husk_kg')} /></div>
              <div className="field"><label>Wastage/Loss (kg)</label><input type="number" step="0.1" min="0" value={form.wastage_kg} onChange={set('wastage_kg')} /></div>
            </div>
            <button type="submit" className="btn primary">{editingId ? 'Update Karein' : 'Batch Save Karein'}</button>{' '}
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Production Register" action={<button className="btn small" onClick={() => exportCSV('production.csv', ['Date','Lot','Process','PaddyIn(kg)','FullGrain(kg)','Kanki25','Kanki50','Kanki100','Bran','Husk','Wastage','Recovery%'], rows.map((b) => { const c = productionCalc(b); return [b.date, b.lot_no, b.process, b.paddy_input_kg, b.rice_output_kg, b.kanki25, b.kanki50, b.kanki100, b.bran_kg, b.husk_kg, b.wastage_kg, c.recoveryPct.toFixed(1)]; }))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Lot</th><th>Process</th><th>Paddy In</th><th>Full Grain</th><th>Kanki 25/50/100</th><th>Bran</th><th>Husk</th><th>Wastage</th><th>Recovery %</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((b) => {
                const c = productionCalc(b);
                return (
                  <tr key={b.id}>
                    <td>{fmtDate(b.date)} {b._pending && <PendingTag />}</td><td>{b.lot_no}</td><td>{b.process}</td>
                    <td>{fmt(b.paddy_input_kg)} kg</td><td>{fmt(b.rice_output_kg)} kg</td>
                    <td>{fmt(b.kanki25)}/{fmt(b.kanki50)}/{fmt(b.kanki100)}</td>
                    <td>{fmt(b.bran_kg)} kg</td><td>{fmt(b.husk_kg)} kg</td><td>{fmt(b.wastage_kg)} kg</td>
                    <td><b>{c.recoveryPct.toFixed(1)}%</b></td>
                    {writable && <td><button className="btn small" onClick={() => startEdit(b)}>Edit</button> <button className="btn small danger" onClick={() => remove(b.id)}>Delete</button></td>}
                  </tr>
                );
              }) : <Empty colSpan={11} text="Koi production batch nahi." />}
            </tbody>
          </table>
        </div>
        <div className="note">Recovery % = (Full Grain + Kanki 25/50/100) ÷ Paddy Input × 100 — total usable rice ka hisaab.</div>
      </Panel>
    </>
  );
}
