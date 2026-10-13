import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { num, rs, sum, balanceSide } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { PARTY_TYPES, PARTY_TYPE_LABELS, SOURCE_LABELS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, BalanceHint, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions,
  RowActions, Empty, PendingTag, Badge, confirmDelete, SyncNote,
} from '../components/ui';
import { T } from '../lib/i18n';

const blank = (prev) => ({ date: prev?.date || todayStr(), party_type: prev?.party_type || 'Kisan', party_name: '', description: '', debit: '', credit: '' });

export default function Ledger() {
  const range = useDateRange('ledger', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('ledger_entries', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const { balances, canonicalName } = useParties();
  const toast = useToast();
  const writable = can(profile, 'ledger', 'add');
  const canEdit = can(profile, 'ledger', 'edit');
  const canDel = can(profile, 'ledger', 'delete');

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [balQ, setBalQ] = useState('');
  const [balType, setBalType] = useState('all');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => rows.filter((e) => (sourceFilter === 'all' || (sourceFilter === 'manual' ? e.source === 'manual' : e.source !== 'manual'))
    && matchesSearch(q, e.party_name, e.description, e.party_type)), [rows, q, sourceFilter]);
  const [visible, more] = useShowMore(filtered);

  const balList = useMemo(() => balances
    .filter((b) => Math.abs(Number(b.balance)) >= 0.01 && (balType === 'all' || b.party_type === balType) && matchesSearch(balQ, b.party_name))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)), [balances, balType, balQ]);
  const [balVisible, balMore] = useShowMore(balList, 50);

  function startEdit(e) {
    setEditingId(e.id);
    setForm({ date: e.date, party_type: e.party_type, party_name: e.party_name, description: e.description || '', debit: Number(e.debit) ? String(e.debit) : '', credit: Number(e.credit) ? String(e.credit) : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(ev) {
    ev.preventDefault();
    if (saving) return;
    const debit = num(form.debit);
    const credit = num(form.credit);
    if (!form.party_name.trim()) return toast.error(T("Party ka naam likhein."));
    if (debit <= 0 && credit <= 0) return toast.error(T("Banam (Debit) ya Jama (Credit) mein raqam likhein."));
    if (debit > 0 && credit > 0 && !window.confirm(T("Ek hi entry mein Banam aur Jama dono hain. Theek hai?"))) return;
    const payload = {
      date: form.date, party_type: form.party_type, party_name: canonicalName(form.party_type, form.party_name),
      description: form.description.trim() || 'Manual entry', debit, credit,
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save — sync baad mein hogi.") : T("Khata entry save ho gayi."));
    setEditingId(null);
    setForm(blank(form));
  }

  async function del(e) {
    if (!confirmDelete(`${e.party_name} — ${e.description}`)) return;
    const res = await remove(e.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(T("Entry delete ho gayi."));
  }

  return (
    <>
      {(writable || (editingId && canEdit)) && (
        <Panel title={editingId ? T("Khata Entry Edit Karein") : T("Manual Khata Entry (Jama / Banam)")}>
          <div className="calcline">
            <b>{T("Jama (Credit)")}</b>{T(" = party ka mill par haq barha (jaise udhaar saman liya, pichla hisaab).  ")}<b>{T("Banam (Debit)")}</b>{T(" = mill ne party ko diya / party par lena barha (jaise qarz diya, adjustment). Kharid, Sale, Payment, Mazdoori aur udhaar kharche ")}<b>{T("khud")}</b>{T(" khata mein jaate hain — un ke liye yahan entry na karein.")}</div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label={T("Party type")}>
                <select value={form.party_type} onChange={set('party_type')}>
                  {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label={T("Party ka naam")}><PartyInput type={form.party_type} value={form.party_name} onChange={set('party_name')} required /></Field>
              <Field label={T("Tafseel")} wide><input value={form.description} onChange={set('description')} placeholder={T("e.g. qarz, adjustment, munafa")} /></Field>
              <Field label={T("Banam / Debit (Rs)")}><NumInput value={form.debit} onChange={set('debit')} /></Field>
              <Field label={T("Jama / Credit (Rs)")}><NumInput value={form.credit} onChange={set('credit')} /></Field>
            </div>
            <BalanceHint type={form.party_type} name={form.party_name} />
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel={T("Entry Save Karein")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Party-wise Balance")}>
        <div className="filterbar">
          <Field label={T("Type")}>
            <select value={balType} onChange={(e) => setBalType(e.target.value)}>
              <option value="all">{T("Sab")}</option>
              {PARTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <SearchBox value={balQ} onChange={setBalQ} placeholder={T("Party ka naam…")} />
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Party")}</th><th>{T("Type")}</th><th className="r">{T("Banam")}</th><th className="r">{T("Jama")}</th><th className="r">{T("Balance")}</th><th>{T("Kis taraf")}</th><th></th></tr></thead>
            <tbody>
              {balVisible.length ? balVisible.map((b) => {
                const side = balanceSide(b.balance);
                return (
                  <tr key={b.party_type + b.party_name}>
                    <td>{b.party_name}</td><td>{b.party_type}</td>
                    <td className="r">{rs(b.total_debit)}</td><td className="r">{rs(b.total_credit)}</td>
                    <td className="r"><b>{rs(Math.abs(b.balance))}</b></td>
                    <td><Badge kind={side.kind}>{side.short}</Badge></td>
                    <td><Link className="btn small" to={`/statement?type=${encodeURIComponent(b.party_type)}&name=${encodeURIComponent(b.party_name)}`}>{T("Khata")}</Link></td>
                  </tr>
                );
              }) : <Empty colSpan={7} text={T("Koi baqaya nahi — sab hisaab barabar.")} />}
            </tbody>
          </table>
        </div>
        {balMore}
      </Panel>

      <Panel
        title={T("Khata Entries")}
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => exportCSV('ledger.csv', ['Date', 'PartyType', 'Party', 'Description', 'Debit', 'Credit', 'Source'],
            filtered.map((e) => [e.date, e.party_type, e.party_name, e.description, e.debit, e.credit, e.source]))}>{T("Export CSV")}</button>
        </>}
      >
        <DateRangeBar range={range}>
          <Field label={T("Source")}>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">{T("Sab")}</option>
              <option value="manual">{T("Sirf manual")}</option>
              <option value="auto">{T("Sirf auto")}</option>
            </select>
          </Field>
          <SearchBox value={q} onChange={setQ} placeholder={T("Party, tafseel…")} />
        </DateRangeBar>
        <div className="mini-stats"><span>{filtered.length}{T(" entries")}</span><span>{T("Banam ")}{rs(sum(filtered, 'debit'))}</span><span>{T("Jama ")}{rs(sum(filtered, 'credit'))}</span></div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Date")}</th><th>{T("Party")}</th><th>{T("Tafseel")}</th><th className="r">{T("Banam")}</th><th className="r">{T("Jama")}</th><th>{T("Source")}</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={7} text={T("Loading…")} /> : visible.length ? visible.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)} {e._pending && <PendingTag />}</td>
                  <td>{e.party_name} <span className="muted">({e.party_type})</span></td>
                  <td className="wrap">{e.description}</td>
                  <td className="r">{Number(e.debit) ? rs(e.debit) : ''}</td>
                  <td className="r">{Number(e.credit) ? rs(e.credit) : ''}</td>
                  <td><Badge kind={e.source === 'manual' ? 'zero' : 'pending'}>{SOURCE_LABELS[e.source] || e.source}</Badge></td>
                  <td>
                    {e.source === 'manual'
                      ? <RowActions onEdit={canEdit ? () => startEdit(e) : null} onDelete={canDel ? () => del(e) : null} />
                      : <span className="muted" title={T("Yeh entry asal record (kharid/sale/payment…) se bani hai — wahin se edit karein")}>{T("Auto")}</span>}
                  </td>
                </tr>
              )) : <Empty colSpan={7} text={T("Is muddat mein koi entry nahi.")} />}
            </tbody>
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
