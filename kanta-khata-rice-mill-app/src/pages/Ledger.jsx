import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { rs, fmtDate, todayStr } from '../lib/calc';
import { exportCSV } from '../lib/csv';
import { Panel, Badge, Empty, PendingTag } from '../components/ui';

const PARTY_TYPES = ['Kisan', 'Arhti', 'Customer', 'Supplier', 'Labor', 'Bank'];
const empty = { date: todayStr(), party_type: 'Kisan', party_name: '', description: '', debit: '0', credit: '0' };

function partyBalances(ledger) {
  const map = {};
  ledger.forEach((e) => {
    const key = e.party_type + '||' + e.party_name;
    if (!map[key]) map[key] = { partyType: e.party_type, partyName: e.party_name, debit: 0, credit: 0 };
    map[key].debit += Number(e.debit) || 0;
    map[key].credit += Number(e.credit) || 0;
  });
  return Object.values(map).map((m) => ({ ...m, balance: m.credit - m.debit }));
}

export default function Ledger() {
  const { rows, insert, remove } = useSupaTable('ledger_entries');
  const { role } = useAuth();
  const [form, setForm] = useState(empty);
  const writable = canWrite(role, 'ledger');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const balances = partyBalances(rows).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  async function submit(e) {
    e.preventDefault();
    const { error } = await insert({
      date: form.date, party_type: form.party_type, party_name: form.party_name.trim(),
      description: form.description.trim() || 'Manual entry', debit: Number(form.debit) || 0, credit: Number(form.credit) || 0,
      source: 'manual',
    });
    if (error) { alert('Save nahi hua: ' + error.message); return; }
    setForm(empty);
  }

  return (
    <>
      {writable && (
        <Panel title="Manual Khata Entry">
          <div className="calcline">
            <b>Credit</b> = Mill ka is party par udhaar badhta hai (jaise naya purchase). &nbsp;
            <b>Debit</b> = Mill ne paisay diye ya party se wasooli hui (jaise advance ya payment). &nbsp;
            Balance <b>+</b> = Mill is party ko dena hai. Balance <b>−</b> = Party ne mill ko dena hai.
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field"><label>Date</label><input type="date" value={form.date} onChange={set('date')} required /></div>
              <div className="field"><label>Party Type</label><select value={form.party_type} onChange={set('party_type')}>{PARTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>Party Name</label><input value={form.party_name} onChange={set('party_name')} required /></div>
              <div className="field"><label>Description</label><input value={form.description} onChange={set('description')} placeholder="e.g. Advance / loan interest / adjustment" /></div>
              <div className="field"><label>Debit (Rs)</label><input type="number" min="0" value={form.debit} onChange={set('debit')} /></div>
              <div className="field"><label>Credit (Rs)</label><input type="number" min="0" value={form.credit} onChange={set('credit')} /></div>
            </div>
            <button type="submit" className="btn primary">Entry Save Karein</button>
          </form>
        </Panel>
      )}

      <Panel title="Party-wise Balances">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Party Type</th><th>Party Name</th><th>Total Debit</th><th>Total Credit</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              {balances.length ? balances.map((b) => (
                <tr key={b.partyType + b.partyName}>
                  <td>{b.partyType}</td><td>{b.partyName}</td><td>{rs(b.debit)}</td><td>{rs(b.credit)}</td>
                  <td>{rs(Math.abs(b.balance))}</td>
                  <td>{b.balance > 0 ? <Badge kind="pos">Mill Owes Party</Badge> : b.balance < 0 ? <Badge kind="neg">Party Owes Mill</Badge> : <Badge>Settled</Badge>}</td>
                </tr>
              )) : <Empty colSpan={6} text="Koi ledger entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="All Khata Entries" action={<button className="btn small" onClick={() => exportCSV('ledger.csv', ['Date','PartyType','Party','Description','Debit','Credit','Source'], rows.map((e) => [e.date, e.party_type, e.party_name, e.description, e.debit, e.credit, e.source]))}>Export CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Party Type</th><th>Party</th><th>Description</th><th>Debit</th><th>Credit</th><th>Source</th>{writable && <th></th>}</tr></thead>
            <tbody>
              {rows.length ? rows.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)} {e._pending && <PendingTag />}</td><td>{e.party_type}</td><td>{e.party_name}</td><td>{e.description}</td>
                  <td>{e.debit ? rs(e.debit) : '—'}</td><td>{e.credit ? rs(e.credit) : '—'}</td><td>{e.source}</td>
                  {writable && <td><button className="btn small danger" onClick={() => remove(e.id)}>Delete</button></td>}
                </tr>
              )) : <Empty colSpan={8} text="Koi entry nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
