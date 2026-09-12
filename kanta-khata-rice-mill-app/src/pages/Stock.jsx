import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { stockCalc, fmt, fmtDate, todayStr, daysBetween, addDays } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Badge, Empty, PendingTag } from '../components/ui';

const ITEMS = ['Paddy', 'Rice - Full Grain', 'Kanki/Broken', 'Bran/Chokar', 'Husk/Tuti', 'Other'];
const empty = { godown: '', lot_no: '', item: 'Paddy', bags: '', weight_per_bag_kg: '50', date_in: todayStr(), last_fumigation: '' };

function toForm(s) {
  return {
    godown: s.godown, lot_no: s.lot_no, item: s.item, bags: String(s.bags), weight_per_bag_kg: String(s.weight_per_bag_kg),
    date_in: s.date_in, last_fumigation: s.last_fumigation || '',
  };
}

export default function Stock() {
  const { rows, insert, update, remove } = useSupaTable('stock_lots', { orderBy: 'date_in' });
  const { profile } = useAuth();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const writable = canWrite(profile, 'stock');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const t = todayStr();

  function startEdit(s) { setEditingId(s.id); setForm(toForm(s)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEdit() { setEditingId(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const totalWeight = Number(form.bags) * Number(form.weight_per_bag_kg);
    const payload = {
      godown: form.godown.trim(), lot_no: form.lot_no.trim(), item: form.item, bags: Number(form.bags),
      weight_per_bag_kg: Number(form.weight_per_bag_kg), total_weight_kg: totalWeight,
      date_in: form.date_in, last_fumigation: form.last_fumigation || null,
    };
    const { error } = editingId ? await update(editingId, payload) : await insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEditingId(null);
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title={editingId ? 'Stock Entry Edit Karein' : 'Naya Stock Entry'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Godown</label><input value={form.godown} onChange={set('godown')} required placeholder="e.g. Godown 1" /></div>
              <div className="field"><label>Lot Number</label><input value={form.lot_no} onChange={set('lot_no')} required /></div>
              <div className="field"><label>Item</label><select value={form.item} onChange={set('item')}>{ITEMS.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
              <div className="field"><label>Bags</label><input type="number" min="0" value={form.bags} onChange={set('bags')} required /></div>
              <div className="field"><label>Weight per Bag (kg)</label><input type="number" step="0.1" min="0" value={form.weight_per_bag_kg} onChange={set('weight_per_bag_kg')} required /></div>
              <div className="field"><label>Date In</label><input type="date" value={form.date_in} onChange={set('date_in')} required /></div>
              <div className="field"><label>Last Fumigation Date (optional)</label><input type="date" value={form.last_fumigation} onChange={set('last_fumigation')} /></div>
            </div>
            <button type="submit" className="btn primary">{editingId ? 'Update Karein' : 'Stock Save Karein'}</button>{' '}
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Stock Register" action={<button className="btn small" onClick={() => exportCSV('stock.csv', ['Godown','Lot','Item','Bags','TotalWeight(kg)','DateIn','LastFumigation'], rows.map((s) => { const c = stockCalc(s); return [s.godown, s.lot_no, s.item, s.bags, c.totalWeight, s.date_in, s.last_fumigation]; }))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Godown</th><th>Lot</th><th>Item</th><th>Bags</th><th>Total Weight</th><th>Date In</th><th>Ageing</th><th>Fumigation</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((s) => {
                const c = stockCalc(s);
                const ageingDays = daysBetween(s.date_in, t);
                const ageBadge = ageingDays > 60 ? 'pos' : ageingDays > 30 ? 'zero' : 'neg';
                let fum;
                if (!s.last_fumigation) fum = <Badge kind="pos">Not Recorded</Badge>;
                else {
                  const d = daysBetween(t, addDays(s.last_fumigation, 30));
                  fum = d < 0 ? <Badge kind="pos">Overdue</Badge> : d <= 7 ? <Badge kind="zero">Due in {d}d</Badge> : <Badge kind="neg">OK</Badge>;
                }
                return (
                  <tr key={s.id}>
                    <td>{s.godown} {s._pending && <PendingTag />}</td><td>{s.lot_no}</td><td>{s.item}</td><td>{s.bags}</td>
                    <td>{fmt(c.totalWeight)} kg</td><td>{fmtDate(s.date_in)}</td>
                    <td><Badge kind={ageBadge}>{ageingDays} din</Badge></td><td>{fum}</td>
                    {writable && <td><button className="btn small" onClick={() => startEdit(s)}>Edit</button> <button className="btn small danger" onClick={() => remove(s.id)}>Delete</button></td>}
                  </tr>
                );
              }) : <Empty colSpan={9} text="Koi stock lot nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
