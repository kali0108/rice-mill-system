import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Badge, Empty, PendingTag, StatCard } from '../components/ui';

const MACHINES = ['Huller', 'Sheller', 'Polisher', 'Boiler', 'Color Sorter', 'Other'];
const CATEGORIES = ['Diesel', 'Electricity', 'Spare Parts', 'Transport-Misc', 'Chai-Pani', 'Other'];

const emptyMachine = { date: todayStr(), machine: 'Huller', issue_description: '', action_taken: '', cost: '0', next_service_due: '', status: 'Operational' };
const emptyExpense = { date: todayStr(), category: 'Diesel', description: '', amount: '', paid_via: 'Cash' };

function machineToForm(m) {
  return { date: m.date, machine: m.machine, issue_description: m.issue_description || '', action_taken: m.action_taken || '', cost: String(m.cost ?? 0), next_service_due: m.next_service_due || '', status: m.status };
}
function expenseToForm(x) {
  return { date: x.date, category: x.category, description: x.description || '', amount: String(x.amount), paid_via: x.paid_via };
}

export default function Expenses() {
  const machinery = useSupaTable('machinery_log');
  const expenses = useSupaTable('expenses');
  const { profile } = useAuth();
  const writableMachinery = canWrite(profile, 'machinery');
  const writableExpenses = canWrite(profile, 'expenses');

  const [mForm, setMForm] = useState(emptyMachine);
  const [mEditingId, setMEditingId] = useState(null);
  const [eForm, setEForm] = useState(emptyExpense);
  const [eEditingId, setEEditingId] = useState(null);
  const setM = (k) => (e) => setMForm((f) => ({ ...f, [k]: e.target.value }));
  const setE = (k) => (e) => setEForm((f) => ({ ...f, [k]: e.target.value }));

  const totalExpenses = expenses.rows.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const dieselTotal = expenses.rows.filter((x) => x.category === 'Diesel').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const electricityTotal = expenses.rows.filter((x) => x.category === 'Electricity').reduce((s, x) => s + (Number(x.amount) || 0), 0);

  function startEditMachine(m) { setMEditingId(m.id); setMForm(machineToForm(m)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEditMachine() { setMEditingId(null); setMForm(emptyMachine); }
  function startEditExpense(x) { setEEditingId(x.id); setEForm(expenseToForm(x)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelEditExpense() { setEEditingId(null); setEForm(emptyExpense); }

  async function submitMachine(e) {
    e.preventDefault();
    const payload = {
      date: mForm.date, machine: mForm.machine, issue_description: mForm.issue_description,
      action_taken: mForm.action_taken, cost: Number(mForm.cost) || 0,
      next_service_due: mForm.next_service_due || null, status: mForm.status,
    };
    const { error } = mEditingId ? await machinery.update(mEditingId, payload) : await machinery.insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setMEditingId(null);
    setMForm(emptyMachine);
  }

  async function submitExpense(e) {
    e.preventDefault();
    const payload = { date: eForm.date, category: eForm.category, description: eForm.description, amount: Number(eForm.amount), paid_via: eForm.paid_via };
    const { error } = eEditingId ? await expenses.update(eEditingId, payload) : await expenses.insert(payload);
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setEEditingId(null);
    setEForm(emptyExpense);
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(totalExpenses)} l="Total Expenses (all-time)" />
        <StatCard n={rs(dieselTotal)} l="Diesel" />
        <StatCard n={rs(electricityTotal)} l="Electricity" />
      </div>

      {writableMachinery && (
        <Panel title={mEditingId ? 'Machinery Log Edit Karein' : 'Machine Maintenance Log — Nayi Entry'}>
          <form onSubmit={submitMachine}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={mForm.date} onChange={setM('date')} required /></div>
              <div className="field"><label>Machine</label><select value={mForm.machine} onChange={setM('machine')}>{MACHINES.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
              <div className="field"><label>Issue Description</label><input value={mForm.issue_description} onChange={setM('issue_description')} placeholder="e.g. belt worn out" /></div>
              <div className="field"><label>Action Taken</label><input value={mForm.action_taken} onChange={setM('action_taken')} /></div>
              <div className="field"><label>Cost (Rs)</label><input type="number" min="0" value={mForm.cost} onChange={setM('cost')} /></div>
              <div className="field"><label>Next Service Due</label><input type="date" value={mForm.next_service_due} onChange={setM('next_service_due')} /></div>
              <div className="field"><label>Status</label><select value={mForm.status} onChange={setM('status')}><option value="Operational">Operational</option><option value="Under Repair">Under Repair</option></select></div>
            </div>
            <button type="submit" className="btn primary">{mEditingId ? 'Update Karein' : 'Log Save Karein'}</button>{' '}
            {mEditingId && <button type="button" className="btn" onClick={cancelEditMachine}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Machinery Log" action={<button className="btn small" onClick={() => exportCSV('machinery_log.csv', ['Date','Machine','Issue','Action','Cost','NextService','Status'], machinery.rows.map((m) => [m.date, m.machine, m.issue_description, m.action_taken, m.cost, m.next_service_due, m.status]))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Machine</th><th>Issue</th><th>Action Taken</th><th>Cost</th><th>Next Service</th><th>Status</th>{writableMachinery && <th></th>}</tr></thead>
            <tbody>
              {machinery.rows.length ? machinery.rows.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.date)} {m._pending && <PendingTag />}</td><td>{m.machine}</td><td>{m.issue_description || '—'}</td>
                  <td>{m.action_taken || '—'}</td><td>{rs(m.cost)}</td><td>{m.next_service_due ? fmtDate(m.next_service_due) : '—'}</td>
                  <td>{m.status === 'Operational' ? <Badge kind="neg">Operational</Badge> : <Badge kind="pos">Under Repair</Badge>}</td>
                  {writableMachinery && <td><button className="btn small" onClick={() => startEditMachine(m)}>Edit</button> <button className="btn small danger" onClick={() => machinery.remove(m.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={8} text="Koi maintenance record nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>

      {writableExpenses && (
        <Panel title={eEditingId ? 'Expense Edit Karein' : 'Daily Expense — Nayi Entry'}>
          <form onSubmit={submitExpense}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={eForm.date} onChange={setE('date')} required /></div>
              <div className="field"><label>Category</label><select value={eForm.category} onChange={setE('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div className="field"><label>Description</label><input value={eForm.description} onChange={setE('description')} /></div>
              <div className="field"><label>Amount (Rs)</label><input type="number" min="0" value={eForm.amount} onChange={setE('amount')} required /></div>
              <div className="field"><label>Paid Via</label><select value={eForm.paid_via} onChange={setE('paid_via')}><option value="Cash">Cash</option><option value="Bank">Bank</option></select></div>
            </div>
            <button type="submit" className="btn primary">{eEditingId ? 'Update Karein' : 'Expense Save Karein'}</button>{' '}
            {eEditingId && <button type="button" className="btn" onClick={cancelEditExpense}>Cancel</button>}
          </form>
        </Panel>
      )}

      <Panel title="Expense Log" action={<button className="btn small" onClick={() => exportCSV('expenses.csv', ['Date','Category','Description','Amount','PaidVia'], expenses.rows.map((x) => [x.date, x.category, x.description, x.amount, x.paid_via]))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Paid Via</th>{writableExpenses && <th></th>}</tr></thead>
            <tbody>
              {expenses.rows.length ? expenses.rows.map((x) => (
                <tr key={x.id}>
                  <td>{fmtDate(x.date)} {x._pending && <PendingTag />}</td><td>{x.category}</td><td>{x.description || '—'}</td>
                  <td>{rs(x.amount)}</td><td>{x.paid_via}</td>
                  {writableExpenses && <td><button className="btn small" onClick={() => startEditExpense(x)}>Edit</button> <button className="btn small danger" onClick={() => expenses.remove(x.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={6} text="Koi expense entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
