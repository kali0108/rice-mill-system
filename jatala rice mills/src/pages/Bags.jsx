import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { num, fmt, rs } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { BAG_TYPES, BAG_MOVEMENTS, PARTY_TYPES } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions, RowActions,
  Empty, PendingTag, Badge, StatCard, confirmDelete, SyncNote,
} from '../components/ui';

const NEEDS_PARTY = ['Issued', 'Returned'];
const blank = (prev) => ({
  date: prev?.date || todayStr(), movement: prev?.movement || 'Issued', party_type: prev?.party_type || 'Arhti', party_name: '',
  bag_type: prev?.bag_type || 'Jute', qty: '', rate: '', charge_to_party: false, notes: '',
});

export default function Bags() {
  const range = useDateRange('bags', 'season');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('bag_movements', { from: range.from, to: range.to });
  const balances = useRpc('get_bag_balances', {}, { watch: ['bag_movements'] });
  const { profile } = useAuth();
  const { canonicalName } = useParties();
  const toast = useToast();
  const writable = canWrite(profile, 'stock');
  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const needsParty = NEEDS_PARTY.includes(form.movement);

  const bal = useMemo(() => balances.data || [], [balances.data]);
  const mill = bal.filter((b) => b.holder === 'mill');
  const withParties = bal.filter((b) => b.holder === 'party' && Number(b.qty) !== 0);
  const outstanding = withParties.reduce((s, b) => s + Number(b.qty), 0);
  const filtered = useMemo(() => rows.filter((b) => matchesSearch(q, b.party_name, b.bag_type, b.movement, b.notes)), [rows, q]);
  const [visible, more] = useShowMore(filtered);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (num(form.qty) <= 0) return toast.error('Boriyon ki tadaad likhein.');
    if (needsParty && !form.party_name.trim()) return toast.error('Party ka naam likhein.');
    if (form.charge_to_party && num(form.rate) <= 0) return toast.error('Charge ke liye fi bori rate likhein.');
    const payload = {
      date: form.date, movement: form.movement, party_type: needsParty ? form.party_type : '',
      party_name: needsParty ? canonicalName(form.party_type, form.party_name) : '', bag_type: form.bag_type,
      qty: Math.round(num(form.qty)), rate: num(form.rate), charge_to_party: needsParty && !!form.charge_to_party, notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success(res.queued ? 'Offline save — sync baad mein hogi.' : 'Bardana entry save ho gayi.');
    setEditingId(null);
    setForm(blank(form));
  }

  async function del(b) {
    if (!confirmDelete(`${b.qty} ${b.bag_type} — ${b.party_name || b.movement}`)) return;
    const res = await remove(b.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        {mill.length ? mill.map((m) => <StatCard key={m.bag_type} n={fmt(m.qty)} l={`Mill ke paas ${m.bag_type} boriyan`} warn={Number(m.qty) < 0} />)
          : <StatCard n="0" l="Mill ke paas boriyan" />}
        <StatCard n={fmt(outstanding)} l={`Parties ke paas boriyan (${withParties.length} parties)`} />
      </div>
      {writable && (
        <Panel title={editingId ? 'Bardana Entry Edit' : 'Bardana (boriyan) — nayi entry'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label="Kya hua"><select value={form.movement} onChange={set('movement')}>{BAG_MOVEMENTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
              {needsParty && (
                <>
                  <Field label="Party type"><select value={form.party_type} onChange={set('party_type')}>{PARTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
                  <Field label="Party ka naam"><PartyInput type={form.party_type} value={form.party_name} onChange={set('party_name')} required /></Field>
                </>
              )}
              <Field label="Bori ki qisam"><select value={form.bag_type} onChange={set('bag_type')}>{BAG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="Tadaad (boriyan)"><NumInput step="1" value={form.qty} onChange={set('qty')} required /></Field>
              {needsParty && (
                <>
                  <Field label="Paise lagenge?" plain>
                    <label className="check"><input type="checkbox" checked={form.charge_to_party} onChange={set('charge_to_party')} /> Haan — party ke khata mein</label>
                  </Field>
                  {form.charge_to_party && <Field label="Rate fi bori (Rs)"><NumInput value={form.rate} onChange={set('rate')} required /></Field>}
                </>
              )}
              <Field label="Note" wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            {needsParty && form.charge_to_party && num(form.qty) > 0 && num(form.rate) > 0 && (
              <div className="calcline">Khata: <b>{rs(num(form.qty) * num(form.rate))}</b> {form.movement === 'Issued' ? 'party ke zimme (Banam)' : 'party ke haq mein (Jama)'}</div>
            )}
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel="Entry Save Karein" />
          </form>
        </Panel>
      )}
      <Panel title="Kis party ke paas kitni boriyan" action={<button type="button" className="btn small" onClick={() => exportCSV('bardana_balances.csv', ['Party', 'Type', 'BagType', 'Issued', 'Returned', 'Balance', 'Last'],
        withParties.map((b) => [b.party_name, b.party_type, b.bag_type, b.issued, b.returned, b.qty, b.last_date]))}>CSV</button>}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Party</th><th>Bori</th><th className="r">Di</th><th className="r">Wapas</th><th className="r">Baqi (party ke paas)</th><th>Aakhri</th></tr></thead>
            <tbody>
              {withParties.length ? withParties.map((b) => (
                <tr key={b.party_type + b.party_name + b.bag_type}>
                  <td><Link to={`/statement?type=${encodeURIComponent(b.party_type)}&name=${encodeURIComponent(b.party_name)}`}>{b.party_name}</Link> <Badge>{b.party_type}</Badge></td>
                  <td>{b.bag_type}</td><td className="r">{fmt(b.issued)}</td><td className="r">{fmt(b.returned)}</td>
                  <td className="r"><b>{fmt(b.qty)}</b> {Number(b.qty) < 0 && <Badge kind="pending">Mill ne deni</Badge>}</td><td>{fmtDate(b.last_date)}</td>
                </tr>
              )) : <Empty colSpan={6} text="Kisi party ke paas boriyan nahi." />}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Bardana Register" action={<SyncNote lastSynced={lastSynced} offline={offline} error={error} />}>
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder="Party, bori…" /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Kya hua</th><th>Party</th><th>Bori</th><th className="r">Tadaad</th><th className="r">Charge</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={7} text="Loading…" /> : visible.length ? visible.map((b) => (
                <tr key={b.id}>
                  <td>{fmtDate(b.date)} {b._pending && <PendingTag />}</td>
                  <td>{BAG_MOVEMENTS.find((m) => m.value === b.movement)?.label || b.movement}</td>
                  <td>{b.party_name || '—'}</td><td>{b.bag_type}</td><td className="r"><b>{fmt(b.qty)}</b></td>
                  <td className="r">{b.charge_to_party ? rs(Number(b.qty) * Number(b.rate)) : '—'}</td>
                  <td><RowActions
                    onEdit={writable ? () => { setEditingId(b.id); setForm({ date: b.date, movement: b.movement, party_type: b.party_type || 'Arhti', party_name: b.party_name || '', bag_type: b.bag_type, qty: String(b.qty), rate: Number(b.rate) ? String(b.rate) : '', charge_to_party: !!b.charge_to_party, notes: b.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                    onDelete={writable ? () => del(b) : null} /></td>
                </tr>
              )) : <Empty colSpan={7} text="Is muddat mein koi entry nahi." />}
            </tbody>
          </table>
        </div>
        {more}
        <div className="note">Fasal se pehle Arhti/Kisan ko boriyan dein (&quot;Party ko di&quot;), paddy ke saath wapas aayen to &quot;wapas aayi&quot;. Nayi boriyon ki khareed ka kharcha Kharche mein &quot;Bardana / Packing&quot; se darj karein.</div>
      </Panel>
    </>
  );
}
