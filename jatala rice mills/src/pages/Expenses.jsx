import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { num, rs, sum, withCurrent } from '../lib/calc';
import { todayStr, fmtDate, daysBetween, addDays } from '../lib/dates';
import { MACHINES, EXPENSE_CATEGORIES, PAID_VIA } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { machineStatus } from '../lib/mill';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, BalanceHint, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions,
  RowActions, Empty, PendingTag, StatCard, Badge, confirmDelete, SyncNote,
} from '../components/ui';

const blankM = () => ({ date: todayStr(), machine: 'Huller', issue_description: '', action_taken: '', cost: '', paid_via: 'Cash', party_name: '', next_service_due: '', status: 'Operational' });
const blankE = (prev) => ({ date: prev?.date || todayStr(), category: prev?.category || 'Diesel', description: '', amount: '', paid_via: prev?.paid_via || 'Cash', party_name: prev?.paid_via === 'Udhaar' ? prev.party_name : '' });

export default function Expenses() {
  const range = useDateRange('expenses', 'month');
  const machinery = useSupaTable('machinery_log', { from: range.from, to: range.to });
  const machineYear = useSupaTable('machinery_log', { from: addDays(todayStr(), -730) });
  const expenses = useSupaTable('expenses', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const { canonicalName } = useParties();
  const toast = useToast();
  const writableM = canWrite(profile, 'machinery');
  const writableE = canWrite(profile, 'expenses');
  const t = todayStr();

  const [mForm, setMForm] = useState(blankM);
  const [mEditing, setMEditing] = useState(null);
  const [eForm, setEForm] = useState(() => blankE());
  const [eEditing, setEEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const setM = (k) => (e) => setMForm((f) => ({ ...f, [k]: e.target.value }));
  const setE = (k) => (e) => setEForm((f) => ({ ...f, [k]: e.target.value }));

  const status = useMemo(() => machineStatus(machineYear.rows), [machineYear.rows]);
  const alerts = status.filter((m) => m.status === 'Under Repair' || (m.next_service_due && daysBetween(t, m.next_service_due) <= 7));

  const expFiltered = useMemo(() => expenses.rows.filter((x) => (catFilter === 'all' || x.category === catFilter) && matchesSearch(q, x.category, x.description, x.party_name)), [expenses.rows, catFilter, q]);
  const [expVisible, expMore] = useShowMore(expFiltered);
  const byCategory = useMemo(() => {
    const m = new Map();
    expenses.rows.forEach((x) => m.set(x.category, (m.get(x.category) || 0) + Number(x.amount || 0)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses.rows]);
  const categories = useMemo(() => [...new Set([...EXPENSE_CATEGORIES, ...expenses.rows.map((x) => x.category)])], [expenses.rows]);

  async function saveMachine(e) {
    e.preventDefault();
    if (saving) return;
    if (mForm.paid_via === 'Udhaar' && num(mForm.cost) > 0 && !mForm.party_name.trim()) return toast.error('Udhaar ke liye workshop/supplier ka naam likhein.');
    const payload = {
      date: mForm.date, machine: mForm.machine, issue_description: mForm.issue_description.trim(), action_taken: mForm.action_taken.trim(),
      cost: num(mForm.cost), paid_via: mForm.paid_via, party_name: mForm.party_name.trim() ? canonicalName('Supplier', mForm.party_name) : '',
      next_service_due: mForm.next_service_due || null, status: mForm.status,
    };
    setSaving(true);
    const res = mEditing ? await machinery.update(mEditing, payload) : await machinery.insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success('Machine record save ho gaya.');
    setMEditing(null);
    setMForm(blankM());
  }

  async function saveExpense(e) {
    e.preventDefault();
    if (saving) return;
    if (num(eForm.amount) <= 0) return toast.error('Raqam likhein.');
    if (eForm.paid_via === 'Udhaar' && !eForm.party_name.trim()) return toast.error('Udhaar ke liye supplier (jaise petrol pump) ka naam likhein.');
    const payload = {
      date: eForm.date, category: eForm.category, description: eForm.description.trim(), amount: num(eForm.amount), paid_via: eForm.paid_via,
      party_name: eForm.party_name.trim() ? canonicalName('Supplier', eForm.party_name) : '',
    };
    setSaving(true);
    const res = eEditing ? await expenses.update(eEditing, payload) : await expenses.insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success(res.queued ? 'Offline save — sync baad mein hogi.' : 'Kharcha save ho gaya.');
    setEEditing(null);
    setEForm(blankE(eForm));
  }

  async function del(table, row, label) {
    if (!confirmDelete(label)) return;
    const res = await table.remove(row.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(sum(expenses.rows, 'amount'))} l="Kul kharche (is muddat)" />
        <StatCard n={rs(sum(machinery.rows, 'cost'))} l="Machine repair (is muddat)" />
        <StatCard n={rs(sum(expenses.rows.filter((x) => x.paid_via === 'Udhaar'), 'amount'))} l="Udhaar kharche" />
        <StatCard n={status.filter((m) => m.status === 'Under Repair').length} l="Machines under repair" warn={status.some((m) => m.status === 'Under Repair')} />
      </div>

      {alerts.length > 0 && (
        <Panel title="Machine alerts">
          <div className="alertlist">
            {alerts.map((m) => {
              const d = m.next_service_due ? daysBetween(t, m.next_service_due) : null;
              return (
                <div className="alertrow" key={m.id}>
                  <span><b>{m.machine}</b>{m.issue_description ? ` — ${m.issue_description}` : ''}</span>
                  <span>
                    {m.status === 'Under Repair' && <Badge kind="bounced">Under repair</Badge>}{' '}
                    {d != null && (d < 0 ? <Badge kind="bounced">Service {Math.abs(d)} din overdue</Badge> : <Badge kind="pending">Service {d === 0 ? 'aaj' : `${d} din mein`}</Badge>)}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {writableE && (
        <Panel title={eEditing ? 'Kharcha Edit Karein' : 'Rozana Kharcha — Nayi Entry'}>
          <form onSubmit={saveExpense}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={eForm.date} onChange={setE('date')} required /></Field>
              <Field label="Category"><select value={eForm.category} onChange={setE('category')}>{withCurrent(EXPENSE_CATEGORIES, eForm.category).map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label="Tafseel"><input value={eForm.description} onChange={setE('description')} placeholder="e.g. 200 litre diesel" /></Field>
              <Field label="Raqam (Rs)"><NumInput value={eForm.amount} onChange={setE('amount')} required /></Field>
              <Field label="Adaigi"><select value={eForm.paid_via} onChange={setE('paid_via')}>{PAID_VIA.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
              <Field label={eForm.paid_via === 'Udhaar' ? 'Supplier (zaroori)' : 'Supplier / dukan (optional)'}>
                <PartyInput type="Supplier" value={eForm.party_name} onChange={setE('party_name')} required={eForm.paid_via === 'Udhaar'} />
              </Field>
            </div>
            {eForm.paid_via === 'Udhaar' && <BalanceHint type="Supplier" name={eForm.party_name} />}
            <FormActions saving={saving} editing={!!eEditing} onCancel={() => { setEEditing(null); setEForm(blankE()); }} saveLabel="Kharcha Save Karein" />
          </form>
        </Panel>
      )}

      <Panel
        title="Kharchon ka Register"
        action={<>
          <SyncNote lastSynced={expenses.lastSynced} offline={expenses.offline} error={expenses.error} />
          <button type="button" className="btn small" onClick={() => exportCSV('expenses.csv', ['Date', 'Category', 'Description', 'Amount', 'PaidVia', 'Supplier'],
            expFiltered.map((x) => [x.date, x.category, x.description, x.amount, x.paid_via, x.party_name]))}>Export CSV</button>
        </>}
      >
        <DateRangeBar range={range}>
          <Field label="Category">
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="all">Sab</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <SearchBox value={q} onChange={setQ} />
        </DateRangeBar>
        {byCategory.length > 0 && (
          <div className="mini-stats">{byCategory.map(([c, v]) => <span key={c}>{c}: {rs(v)}</span>)}</div>
        )}
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Category</th><th>Tafseel</th><th className="r">Raqam</th><th>Adaigi</th><th></th></tr></thead>
            <tbody>
              {expenses.loading && !expenses.rows.length ? <Empty colSpan={6} text="Loading…" /> : expVisible.length ? expVisible.map((x) => (
                <tr key={x.id}>
                  <td>{fmtDate(x.date)} {x._pending && <PendingTag />}</td>
                  <td>{x.category}</td>
                  <td>{x.description || '—'}{x.party_name ? <div className="muted">{x.party_name}</div> : null}</td>
                  <td className="r"><b>{rs(x.amount)}</b></td>
                  <td><Badge kind={x.paid_via === 'Udhaar' ? 'pos' : 'zero'}>{x.paid_via}</Badge></td>
                  <td>
                    <RowActions
                      onEdit={writableE ? () => { setEEditing(x.id); setEForm({ date: x.date, category: x.category, description: x.description || '', amount: String(x.amount), paid_via: x.paid_via || 'Cash', party_name: x.party_name || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={writableE ? () => del(expenses, x, `${x.category} ${rs(x.amount)}`) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={6} text="Is muddat mein koi kharcha nahi." />}
            </tbody>
          </table>
        </div>
        {expMore}
      </Panel>

      {writableM && (
        <Panel title={mEditing ? 'Machine Record Edit' : 'Machine Maintenance / Repair — Nayi Entry'}>
          <form onSubmit={saveMachine}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={mForm.date} onChange={setM('date')} required /></Field>
              <Field label="Machine"><select value={mForm.machine} onChange={setM('machine')}>{withCurrent(MACHINES, mForm.machine).map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
              <Field label="Kharabi"><input value={mForm.issue_description} onChange={setM('issue_description')} placeholder="e.g. rubber roll ghis gaya" /></Field>
              <Field label="Kya kiya"><input value={mForm.action_taken} onChange={setM('action_taken')} /></Field>
              <Field label="Kharcha (Rs)"><NumInput value={mForm.cost} onChange={setM('cost')} /></Field>
              <Field label="Adaigi"><select value={mForm.paid_via} onChange={setM('paid_via')}>{PAID_VIA.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
              <Field label="Workshop / supplier"><PartyInput type="Supplier" value={mForm.party_name} onChange={setM('party_name')} required={mForm.paid_via === 'Udhaar' && num(mForm.cost) > 0} /></Field>
              <Field label="Agli service"><input type="date" value={mForm.next_service_due} onChange={setM('next_service_due')} /></Field>
              <Field label="Halat"><select value={mForm.status} onChange={setM('status')}><option value="Operational">Chal rahi hai (Operational)</option><option value="Under Repair">Repair mein</option></select></Field>
            </div>
            <FormActions saving={saving} editing={!!mEditing} onCancel={() => { setMEditing(null); setMForm(blankM()); }} saveLabel="Record Save Karein" />
          </form>
        </Panel>
      )}

      <Panel
        title="Machinery Log"
        action={<button type="button" className="btn small" onClick={() => exportCSV('machinery_log.csv', ['Date', 'Machine', 'Issue', 'Action', 'Cost', 'PaidVia', 'Supplier', 'NextService', 'Status'],
          machinery.rows.map((m) => [m.date, m.machine, m.issue_description, m.action_taken, m.cost, m.paid_via, m.party_name, m.next_service_due, m.status]))}>Export CSV</button>}
      >
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Machine</th><th>Kharabi / Kaam</th><th className="r">Kharcha</th><th>Agli service</th><th>Halat</th><th></th></tr></thead>
            <tbody>
              {machinery.rows.length ? machinery.rows.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDate(m.date)} {m._pending && <PendingTag />}</td>
                  <td>{m.machine}</td>
                  <td className="wrap">{m.issue_description || '—'}{m.action_taken ? <div className="muted">{m.action_taken}</div> : null}</td>
                  <td className="r">{rs(m.cost)}{Number(m.cost) ? <div className="muted">{m.paid_via}{m.party_name ? ' · ' + m.party_name : ''}</div> : null}</td>
                  <td>{m.next_service_due ? fmtDate(m.next_service_due) : '—'}</td>
                  <td>{m.status === 'Under Repair' ? <Badge kind="bounced">Repair mein</Badge> : <Badge kind="neg">Chal rahi</Badge>}</td>
                  <td>
                    <RowActions
                      onEdit={writableM ? () => { setMEditing(m.id); setMForm({ date: m.date, machine: m.machine, issue_description: m.issue_description || '', action_taken: m.action_taken || '', cost: Number(m.cost) ? String(m.cost) : '', paid_via: m.paid_via || 'Cash', party_name: m.party_name || '', next_service_due: m.next_service_due || '', status: m.status }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={writableM ? () => del(machinery, m, `${m.machine} ${fmtDate(m.date)}`) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={7} text="Is muddat mein koi record nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
