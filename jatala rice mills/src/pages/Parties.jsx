import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useParties, useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabaseClient';
import { emitLocalChange } from '../lib/realtime';
import { canWrite } from '../lib/roles';
import { num, rs, sum, balanceSide, r2 } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { PARTY_TYPES, PARTY_TYPE_LABELS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { whatsappLink, reminderText } from '../lib/whatsapp';
import { friendlyError } from '../lib/errors';
import { Panel, Field, NumInput, SearchBox, matchesSearch, useShowMore, FormActions, RowActions, Empty, PendingTag, Badge, StatCard, confirmDelete } from '../components/ui';

const blank = (type = 'Kisan') => ({
  party_type: type, name: '', phone: '', address: '', cnic: '', opening_amount: '', opening_side: 'credit',
  opening_date: todayStr(), notes: '', active: true,
});

function toForm(p) {
  const ob = Number(p.opening_balance) || 0;
  return {
    party_type: p.party_type, name: p.name, phone: p.phone || '', address: p.address || '', cnic: p.cnic || '',
    opening_amount: ob ? String(Math.abs(ob)) : '', opening_side: ob < 0 ? 'debit' : 'credit',
    opening_date: p.opening_date || todayStr(), notes: p.notes || '', active: p.active !== false,
  };
}

export default function Parties() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { parties, insert, update, remove, balances, loading } = useParties();
  const toast = useToast();
  const writable = canWrite(profile, 'parties');
  const canMerge = writable && canWrite(profile, 'ledger');

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [show, setShow] = useState('all');
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [mergeFrom, setMergeFrom] = useState(null);
  const [mergeInto, setMergeInto] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // parties + their khata balance (also any khata name that has no party row)
  const list = useMemo(() => {
    const bal = new Map(balances.map((b) => [`${b.party_type}|${String(b.party_name).toLowerCase()}`, b]));
    const out = parties.map((p) => {
      const b = bal.get(`${p.party_type}|${p.name.toLowerCase()}`);
      return { ...p, balance: b ? Number(b.balance) : 0, last_date: b?.last_date || null, entries: b ? Number(b.entry_count) : 0 };
    });
    const known = new Set(parties.map((p) => `${p.party_type}|${p.name.toLowerCase()}`));
    balances.forEach((b) => {
      const k = `${b.party_type}|${String(b.party_name).toLowerCase()}`;
      if (!known.has(k)) out.push({ id: 'k:' + k, party_type: b.party_type, name: b.party_name, phone: '', balance: Number(b.balance), last_date: b.last_date, entries: Number(b.entry_count), _khataOnly: true });
    });
    return out;
  }, [parties, balances]);

  const filtered = useMemo(() => {
    const f = list.filter((p) => (typeFilter === 'all' || p.party_type === typeFilter)
      && (show === 'all' || (show === 'payable' && r2(p.balance) > 0) || (show === 'receivable' && r2(p.balance) < 0) || (show === 'inactive' && p.active === false))
      && matchesSearch(q, p.name, p.phone, p.cnic, p.address));
    const sorted = [...f];
    if (sortBy === 'balance') sorted.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    else if (sortBy === 'recent') sorted.sort((a, b) => String(b.last_date || '').localeCompare(String(a.last_date || '')));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [list, typeFilter, show, q, sortBy]);
  const [visible, more] = useShowMore(filtered);

  const payable = sum(filtered.filter((p) => p.balance > 0), 'balance');
  const receivable = Math.abs(sum(filtered.filter((p) => p.balance < 0), 'balance'));

  function startEdit(p) {
    setEditingId(p.id);
    setForm(toForm(p));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancel() {
    setEditingId(null);
    setForm(blank(form.party_type));
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    const name = form.name.trim().replace(/\s+/g, ' ');
    if (!name) return toast.error('Naam likhein.');
    const dup = parties.find((p) => p.party_type === form.party_type && p.name.toLowerCase() === name.toLowerCase() && p.id !== editingId);
    if (dup) return toast.error('Is naam aur type ki party pehle se maujood hai.');
    const amt = num(form.opening_amount);
    const payload = {
      party_type: form.party_type, name, phone: form.phone.trim(), address: form.address.trim(), cnic: form.cnic.trim(),
      opening_balance: form.opening_side === 'debit' ? -amt : amt, opening_date: form.opening_date || todayStr(),
      notes: form.notes.trim(), active: !!form.active,
    };
    if (editingId) {
      const old = parties.find((p) => p.id === editingId);
      if (old && old.name !== name && !window.confirm(`Naam "${old.name}" se "${name}" ho jayega — har kharid, sale, payment aur khata mein bhi. Theek hai?`)) return;
    }
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    toast.success(editingId ? 'Party update ho gayi.' : 'Party add ho gayi.');
    emitLocalChange('ledger_entries');
    setEditingId(null);
    setForm(blank(form.party_type));
  }

  async function del(p) {
    if (!confirmDelete(p.name)) return;
    const res = await remove(p.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success('Party delete ho gayi.');
  }

  async function doMerge() {
    const target = parties.find((p) => p.id === mergeInto);
    if (!mergeFrom || !target) return toast.error('Kis party mein merge karna hai, chunein.');
    if (!window.confirm(`"${mergeFrom.name}" ki saari entries "${target.name}" mein chali jayengi aur "${mergeFrom.name}" khatam ho jayegi. Theek hai?`)) return;
    const { error } = await supabase.rpc('merge_party', { p_from: mergeFrom.id, p_into: target.id });
    if (error) return toast.error(friendlyError(error));
    toast.success('Parties merge ho gayin.');
    setMergeFrom(null);
    setMergeInto('');
    ['parties', 'ledger_entries', 'purchases', 'sales', 'payments', 'labor_entries', 'expenses', 'machinery_log', 'transport_entries'].forEach(emitLocalChange);
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(payable)} l="Mill ne dena hai (Payable)" warn={payable > 0} />
        <StatCard n={rs(receivable)} l="Mill ne lena hai (Receivable)" />
        <StatCard n={filtered.length} l="Parties (is filter mein)" />
      </div>

      {writable && (
        <Panel title={editingId ? 'Party Edit Karein' : 'Nayi Party'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Type">
                <select value={form.party_type} onChange={set('party_type')} disabled={!!editingId}>
                  {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label="Naam"><input value={form.name} onChange={set('name')} required /></Field>
              <Field label="Phone / WhatsApp"><input type="tel" value={form.phone} onChange={set('phone')} placeholder="03xx-xxxxxxx" /></Field>
              <Field label="CNIC"><input value={form.cnic} onChange={set('cnic')} placeholder="xxxxx-xxxxxxx-x" /></Field>
              <Field label="Pata (Address)" wide><input value={form.address} onChange={set('address')} /></Field>
              <Field label="Opening balance (pichla hisaab) Rs"><NumInput value={form.opening_amount} onChange={set('opening_amount')} /></Field>
              <Field label="Opening kis taraf?">
                <select value={form.opening_side} onChange={set('opening_side')}>
                  <option value="credit">Mill ne party ko dena hai (Jama)</option>
                  <option value="debit">Party ne mill ko dena hai (Banam)</option>
                </select>
              </Field>
              <Field label="Opening ki tareekh"><input type="date" value={form.opening_date} onChange={set('opening_date')} /></Field>
              <Field label="Note"><input value={form.notes} onChange={set('notes')} /></Field>
              <Field label="Status" plain>
                <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>
              </Field>
            </div>
            <FormActions saving={saving} editing={!!editingId} onCancel={cancel} saveLabel="Party Save Karein" />
          </form>
        </Panel>
      )}

      {mergeFrom && (
        <Panel title={`Merge: "${mergeFrom.name}" (${mergeFrom.party_type})`}>
          <div className="note">Ghalat spelling se bani duplicate party ko asal party mein mila dein. Saari kharid/sale/payment/khata entries asal party par chali jayengi.</div>
          <div className="filterbar">
            <Field label="Asal party chunein">
              <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                <option value="">— chunein —</option>
                {parties.filter((p) => p.party_type === mergeFrom.party_type && p.id !== mergeFrom.id)
                  .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <button type="button" className="btn primary" onClick={doMerge}>Merge Karein</button>
            <button type="button" className="btn" onClick={() => setMergeFrom(null)}>Cancel</button>
          </div>
        </Panel>
      )}

      <Panel
        title="Parties ki List"
        action={<button type="button" className="btn small" onClick={() => exportCSV('parties.csv',
          ['Type', 'Name', 'Phone', 'CNIC', 'Address', 'Balance', 'Side', 'LastEntry'],
          filtered.map((p) => [p.party_type, p.name, p.phone, p.cnic, p.address, Math.abs(p.balance), balanceSide(p.balance).short, p.last_date]))}>Export CSV</button>}
      >
        <div className="filterbar">
          <Field label="Type">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Sab types</option>
              {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Dikhayein">
            <select value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="all">Sab</option>
              <option value="payable">Jinhein mill ne dena hai</option>
              <option value="receivable">Jin se lena hai</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Tarteeb">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Naam</option>
              <option value="balance">Bara balance pehle</option>
              <option value="recent">Taaza len-den pehle</option>
            </select>
          </Field>
          <SearchBox value={q} onChange={setQ} placeholder="Naam, phone, CNIC…" />
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Naam</th><th>Type</th><th>Phone</th><th className="r">Balance</th><th>Kis taraf</th><th>Aakhri entry</th><th></th></tr></thead>
            <tbody>
              {loading && !list.length ? <Empty colSpan={7} text="Loading…" /> : visible.length ? visible.map((p) => {
                const side = balanceSide(p.balance);
                return (
                  <tr key={p.id} className={p.active === false ? 'dim' : ''}>
                    <td>{p.name} {p._pending && <PendingTag />} {p.active === false && <Badge>Inactive</Badge>}</td>
                    <td>{p.party_type}</td>
                    <td>{p.phone || '—'}</td>
                    <td className="r"><b>{rs(Math.abs(p.balance))}</b></td>
                    <td><Badge kind={side.kind}>{side.short}</Badge></td>
                    <td>{p.last_date ? fmtDate(p.last_date) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="btn small" to={`/statement?type=${encodeURIComponent(p.party_type)}&name=${encodeURIComponent(p.name)}`}>Khata</Link>
                        {p.phone && (
                          <a className="btn small" href={whatsappLink(p.phone, reminderText(settings, p.name, p.balance))} target="_blank" rel="noreferrer">WhatsApp</a>
                        )}
                        {!p._khataOnly && (
                          <RowActions
                            onEdit={writable ? () => startEdit(p) : null}
                            onDelete={writable && !p.entries ? () => del(p) : null}
                            extra={canMerge ? <button type="button" className="btn small" onClick={() => { setMergeFrom(p); setMergeInto(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Merge</button> : null}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : <Empty colSpan={7} text="Koi party nahi mili." />}
            </tbody>
          </table>
        </div>
        {more}
        <div className="note">Party ka naam yahan badalne se har kharid, sale, payment aur khata entry mein khud badal jata hai. Jis party ke khata mein entries hon woh delete nahi hoti — Merge ya Inactive karein.</div>
      </Panel>
    </>
  );
}
