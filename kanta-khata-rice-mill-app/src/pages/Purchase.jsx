import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { purchaseCalc, fmt, rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Empty, PendingTag } from '../components/ui';

const VARIETIES = ['Basmati 1121', 'Super Basmati', 'PK-386', 'Irri-6', 'Other'];
const empty = { date: todayStr(), mode: 'Direct', farmer_name: '', arhti_name: '', variety: 'Super Basmati', bags: '', gross_wt: '', tare_wt: '', moisture_pct: '', broken_pct: '', fm_pct: '', rate_per_maund: '', advance_applied: '0' };

export default function Purchase() {
  const { rows, insert, remove } = useSupaTable('purchases');
  const { role } = useAuth();
  const [form, setForm] = useState(empty);
  const writable = canWrite(role, 'purchase');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const netWt = Number(form.gross_wt) - Number(form.tare_wt);
    const amount = (netWt / 40) * Number(form.rate_per_maund);
    const netPayable = amount - Number(form.advance_applied || 0);
    const { error } = await insert({
      date: form.date, mode: form.mode, farmer_name: form.farmer_name.trim(), arhti_name: form.arhti_name.trim(),
      variety: form.variety, bags: Number(form.bags), gross_wt: Number(form.gross_wt), tare_wt: Number(form.tare_wt),
      net_wt: netWt, moisture_pct: Number(form.moisture_pct) || 0, broken_pct: Number(form.broken_pct) || 0,
      fm_pct: Number(form.fm_pct) || 0, rate_per_maund: Number(form.rate_per_maund), amount,
      advance_applied: Number(form.advance_applied) || 0, net_payable: netPayable,
    });
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title="Nayi Kharid Entry">
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Mode</label>
                <select value={form.mode} onChange={set('mode')}>
                  <option value="Direct">Direct se Kisan</option>
                  <option value="Arhti">Arhti/Beopari ke zariye</option>
                </select>
              </div>
              <div className="field"><label>Farmer / Kisan Name</label><input value={form.farmer_name} onChange={set('farmer_name')} required placeholder="e.g. Allah Ditta" /></div>
              <div className="field"><label>Arhti Name (agar applicable)</label><input value={form.arhti_name} onChange={set('arhti_name')} placeholder="optional" /></div>
              <div className="field"><label>Variety</label>
                <select value={form.variety} onChange={set('variety')}>{VARIETIES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              </div>
              <div className="field"><label>Bags (Bardana)</label><input type="number" min="0" value={form.bags} onChange={set('bags')} required /></div>
              <div className="field"><label>Gross Weight (kg)</label><input type="number" step="0.1" min="0" value={form.gross_wt} onChange={set('gross_wt')} required /></div>
              <div className="field"><label>Tare Weight (kg)</label><input type="number" step="0.1" min="0" value={form.tare_wt} onChange={set('tare_wt')} required /></div>
              <div className="field"><label>Moisture %</label><input type="number" step="0.1" value={form.moisture_pct} onChange={set('moisture_pct')} /></div>
              <div className="field"><label>Broken %</label><input type="number" step="0.1" value={form.broken_pct} onChange={set('broken_pct')} /></div>
              <div className="field"><label>Foreign Matter %</label><input type="number" step="0.1" value={form.fm_pct} onChange={set('fm_pct')} /></div>
              <div className="field"><label>Rate (Rs per 40kg maund)</label><input type="number" min="0" value={form.rate_per_maund} onChange={set('rate_per_maund')} required /></div>
              <div className="field"><label>Pichla Advance Adjust (Rs)</label><input type="number" min="0" value={form.advance_applied} onChange={set('advance_applied')} /></div>
            </div>
            <button type="submit" className="btn primary">Purchase Save Karein</button>
          </form>
        </Panel>
      )}

      <Panel title="Kharid Register" action={<button className="btn small" onClick={() => exportCSV('purchases.csv', ['Date','Farmer','Mode','Arhti','Variety','Bags','NetWt(kg)','Moisture%','Rate/Maund','Amount','AdvanceAdj','NetPayable'], rows.map((p) => { const c = purchaseCalc(p); return [p.date, p.farmer_name, p.mode, p.arhti_name, p.variety, p.bags, c.netWt.toFixed(1), p.moisture_pct, p.rate_per_maund, c.amount.toFixed(0), p.advance_applied, c.netPayable.toFixed(0)]; }))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Farmer</th><th>Mode</th><th>Variety</th><th>Bags</th><th>Net Wt (kg)</th><th>Moisture%</th><th>Rate/Maund</th><th>Amount</th><th>Advance Adj</th><th>Net Payable</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((p) => {
                const c = purchaseCalc(p);
                return (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)} {p._pending && <PendingTag />}</td><td>{p.farmer_name}</td>
                    <td>{p.mode}{p.arhti_name ? ' — ' + p.arhti_name : ''}</td><td>{p.variety}</td><td>{p.bags}</td>
                    <td>{fmt(c.netWt)}</td><td>{p.moisture_pct || 0}%</td><td>{rs(p.rate_per_maund)}</td>
                    <td>{rs(c.amount)}</td><td>{rs(p.advance_applied)}</td><td><b>{rs(c.netPayable)}</b></td>
                    {writable && <td><button className="btn small danger" onClick={() => remove(p.id)}>Delete</button></td>}
                  </tr>
                );
              }) : <Empty colSpan={12} text="Abhi koi purchase entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
