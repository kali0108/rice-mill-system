import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { rs, fmtDate, todayStr, daysBetween } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Empty, PendingTag } from '../components/ui';

const PARTY_TYPES = ['Kisan', 'Arhti', 'Customer', 'Supplier', 'Labor', 'Bank'];
const empty = { date: todayStr(), party_type: 'Kisan', party_name: '', direction: 'Paid', method: 'Cash', amount: '', cheque_no: '', due_date: '', status: 'Cleared' };

function toForm(p) {
  return {
    date: p.date, party_type: p.party_type, party_name: p.party_name, direction: p.direction, method: p.method,
    amount: String(p.amount), cheque_no: p.cheque_no || '', due_date: p.due_date || '', status: p.status,
  };
}

export default function Payments() {
  const { rows, insert, remove, update } = useSupaTable('payments');
  const { profile } = useAuth();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const writable = canWrite(profile, 'payments');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const t = todayStr();
  const cheques = rows.filter((p) => p.method === 'Cheque').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  function startEdit(p) { setEditingId(p.id); setForm(toForm(p)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEdit() { setEditingId(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const payload = {
      date: form.date, party_type: form.party_type, party_name: form.party_name.trim(), direction: form.direction,
      method: form.method, amount: Number(form.amount), cheque_no: form.cheque_no || '',
      due_date: form.method === 'Cheque' ? (form.due_date || form.date) : form.date,
      status: editingId ? form.status : (form.method === 'Cheque' ? 'Pending' : 'Cleared'),
    };
    const { error } = editingId ? await update(editingId, payload) : await insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEditingId(null);
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title={editingId ? 'Payment Entry Edit Karein' : 'Nayi Payment / Receipt'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Party Type</label><select value={form.party_type} onChange={set('party_type')}>{PARTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>Party Name</label><input value={form.party_name} onChange={set('party_name')} required /></div>
              <div className="field"><label>Direction</label>
                <select value={form.direction} onChange={set('direction')}><option value="Paid">Mill ne Diya (Paid)</option><option value="Received">Mill ne Liya (Received)</option></select>
              </div>
              <div className="field"><label>Method</label>
                <select value={form.method} onChange={set('method')}>
                  <option value="Cash">Cash</option><option value="Bank">Bank Transfer</option><option value="Cheque">Cheque</option><option value="Online">Online</option>
                </select>
              </div>
              <div className="field"><label>Amount (Rs)</label><input type="number" min="0" value={form.amount} onChange={set('amount')} required /></div>
              {form.method === 'Cheque' && <>
                <div className="field"><label>Cheque Number</label><input value={form.cheque_no} onChange={set('cheque_no')} /></div>
                <div className="field"><label>Cheque Due Date</label><input type="date" value={form.due_date} onChange={set('due_date')} /></div>
              </>}
              {editingId && form.method === 'Cheque' && (
                <div className="field"><label>Status</label>
                  <select value={form.status} onChange={set('status')}><option value="Pending">Pending</option><option value="Cleared">Cleared</option><option value="Bounced">Bounced</option></select>
                </div>
              )}
            </div>
            <button type="submit" className="btn primary">{editingId ? 'Update Karein' : 'Entry Save Karein'}</button>{' '}
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Post-Dated Cheque Tracker">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Cheque #</th><th>Party</th><th>Direction</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
            <tbody>
              {cheques.length ? cheques.map((c) => {
                const d = daysBetween(t, c.due_date);
                return (
                  <tr key={c.id}>
                    <td>{c.cheque_no} {c._pending && <PendingTag />}</td><td>{c.party_name}</td><td>{c.direction}</td><td>{rs(c.amount)}</td>
                    <td>{fmtDate(c.due_date)} {d < 0 && c.status === 'Pending' && <span className="badge pos">Overdue</span>} {d >= 0 && d <= 3 && c.status === 'Pending' && <span className="badge zero">Soon</span>}</td>
                    <td>
                      <select value={c.status} onChange={(e) => writable && update(c.id, { status: e.target.value })} disabled={!writable} className={`badge ${c.status === 'Cleared' ? 'cleared' : c.status === 'Bounced' ? 'bounced' : 'pending'}`} style={{ border: 'none' }}>
                        <option value="Pending">Pending</option><option value="Cleared">Cleared</option><option value="Bounced">Bounced</option>
                      </select>
                    </td>
                  </tr>
                );
              }) : <Empty colSpan={6} text="Koi cheque record nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="All Payments" action={<button className="btn small" onClick={() => exportCSV('payments.csv', ['Date','PartyType','Party','Direction','Method','Amount','ChequeNo','DueDate','Status'], rows.map((p) => [p.date, p.party_type, p.party_name, p.direction, p.method, p.amount, p.cheque_no, p.due_date, p.status]))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Party Type</th><th>Party</th><th>Direction</th><th>Method</th><th>Amount</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.date)}</td><td>{p.party_type}</td><td>{p.party_name}</td><td>{p.direction}</td><td>{p.method}</td><td>{rs(p.amount)}</td>
                  {writable && <td><button className="btn small" onClick={() => startEdit(p)}>Edit</button> <button className="btn small danger" onClick={() => remove(p.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={7} text="Koi payment entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
