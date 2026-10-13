import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties, useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { num, rs, sum } from '../lib/calc';
import { todayStr, fmtDate, daysBetween } from '../lib/dates';
import { PARTY_TYPES, PARTY_TYPE_LABELS, PAYMENT_METHODS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printPaymentReceipt } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, BalanceHint, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions,
  RowActions, Empty, PendingTag, Badge, StatCard, confirmDelete, SyncNote,
} from '../components/ui';
import { T } from '../lib/i18n';

const blank = (prev) => ({
  date: prev?.date || todayStr(), party_type: prev?.party_type || 'Kisan', party_name: '', direction: prev?.direction || 'Paid',
  method: 'Cash', amount: '', cheque_no: '', bank_name: '', due_date: '', status: 'Pending', notes: '',
});

function statusBadge(c, today) {
  if (c.status === 'Cleared') return <Badge kind="cleared">{T("Cleared")}</Badge>;
  if (c.status === 'Bounced') return <Badge kind="bounced">{T("Bounced")}</Badge>;
  const d = daysBetween(today, c.due_date);
  if (Number.isNaN(d)) return <Badge kind="pending">{T("Pending")}</Badge>;
  if (d < 0) return <Badge kind="bounced">{T("Overdue ")}{Math.abs(d)}{T(" din")}</Badge>;
  if (d <= 3) return <Badge kind="pending">{d === 0 ? T("Aaj") : `${d}${T(" din mein")}`}</Badge>;
  return <Badge kind="zero">{d}{T(" din mein")}</Badge>;
}

export default function Payments() {
  const range = useDateRange('payments', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('payments', { from: range.from, to: range.to });
  const pendingCheques = useSupaTable('payments', { eq: { method: 'Cheque', status: 'Pending' }, orderBy: 'due_date', ascending: true });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { canonicalName, balanceOf } = useParties();
  const toast = useToast();
  const writable = can(profile, 'payments', 'add');
  const canEdit = can(profile, 'payments', 'edit');
  const canDel = can(profile, 'payments', 'delete');
  const today = todayStr();

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const filtered = useMemo(() => rows.filter((p) => matchesSearch(q, p.party_name, p.party_type, p.cheque_no, p.bank_name, p.notes, p.method)), [rows, q]);
  const [visible, more] = useShowMore(filtered);
  const paidTotal = sum(filtered.filter((p) => p.direction === 'Paid' && p.status !== 'Bounced'), 'amount');
  const recvTotal = sum(filtered.filter((p) => p.direction === 'Received' && p.status !== 'Bounced'), 'amount');

  const bal = balanceOf(form.party_type, form.party_name);

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      date: p.date, party_type: p.party_type, party_name: p.party_name, direction: p.direction, method: p.method,
      amount: String(p.amount), cheque_no: p.cheque_no || '', bank_name: p.bank_name || '', due_date: p.due_date || '',
      status: p.status || 'Pending', notes: p.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fillBalance() {
    // balance > 0: mill owes the party -> pay it; < 0: party owes -> receive it
    if (!bal) return;
    setForm((f) => ({ ...f, amount: String(Math.abs(bal)), direction: bal > 0 ? 'Paid' : 'Received' }));
  }

  async function submit(e, andPrint) {
    if (e) e.preventDefault();
    if (saving) return;
    const amount = num(form.amount);
    if (!form.party_name.trim()) return toast.error(T("Party ka naam likhein."));
    if (amount <= 0) return toast.error(T("Raqam likhein."));
    if (form.method === 'Cheque' && !form.cheque_no.trim()) return toast.error(T("Cheque number likhein."));
    const cheque = form.method === 'Cheque';
    const payload = {
      date: form.date, party_type: form.party_type, party_name: canonicalName(form.party_type, form.party_name),
      direction: form.direction, method: form.method, amount,
      cheque_no: cheque ? form.cheque_no.trim() : '',
      bank_name: form.method === 'Cash' ? '' : form.bank_name.trim(),
      due_date: cheque ? form.due_date || form.date : form.date,
      status: cheque ? (editingId ? form.status : 'Pending') : 'Cleared',
      notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save — sync baad mein hogi.") : T("Payment save ho gayi (khata update)."));
    if (andPrint) printPaymentReceipt(res.data || payload, settings);
    setEditingId(null);
    setForm(blank(form));
  }

  async function setStatus(c, status) {
    if (status === c.status) return;
    if (status === 'Bounced' && !window.confirm(`${T("Cheque #")}${c.cheque_no}${T(" bounce mark karein? Is ki raqam (")}${rs(c.amount)}) ${c.party_name}${T(" ke khata se wapas hat jayegi.")}`)) return;
    const res = await update(c.id, { status });
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(`${T("Cheque ")}${status === 'Cleared' ? T("clear") : status === 'Bounced' ? T("bounce") : T("pending")}${T(" mark ho gaya.")}`);
  }

  async function del(p) {
    if (!confirmDelete(`${p.party_name} — ${rs(p.amount)}`)) return;
    const res = await remove(p.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(T("Payment delete ho gayi."));
  }

  const chequeRows = pendingCheques.rows;
  const dueSoon = chequeRows.filter((c) => daysBetween(today, c.due_date) <= 3);

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(paidTotal)} l={T("Ada kiya (is muddat)")} />
        <StatCard n={rs(recvTotal)} l={T("Wasool kiya (is muddat)")} />
        <StatCard n={chequeRows.length} l={T("Pending cheques")} />
        <StatCard n={dueSoon.length} l={T("Cheques due (3 din tak / overdue)")} warn={dueSoon.length > 0} />
      </div>

      {(writable || (editingId && canEdit)) && (
        <Panel title={editingId ? T("Payment Edit Karein") : T("Nayi Payment / Wasooli")}>
          <form onSubmit={(e) => submit(e, false)}>
            <div className="form-grid">
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label={T("Party type")}>
                <select value={form.party_type} onChange={set('party_type')}>
                  {PARTY_TYPES.map((t) => <option key={t} value={t}>{PARTY_TYPE_LABELS[t]}</option>)}
                </select>
              </Field>
              <Field label={T("Party ka naam")}><PartyInput type={form.party_type} value={form.party_name} onChange={set('party_name')} required /></Field>
              <Field label={T("Len-den")}>
                <select value={form.direction} onChange={set('direction')}>
                  <option value="Paid">{T("Mill ne diya (Adaigi / Paid)")}</option>
                  <option value="Received">{T("Mill ne liya (Wasooli / Received)")}</option>
                </select>
              </Field>
              <Field label={T("Tareeqa")}>
                <select value={form.method} onChange={set('method')}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label={T("Raqam (Rs)")}><NumInput value={form.amount} onChange={set('amount')} required /></Field>
              {form.method === 'Cheque' && (
                <>
                  <Field label={T("Cheque #")}><input value={form.cheque_no} onChange={set('cheque_no')} required /></Field>
                  <Field label={T("Cheque ki tareekh (due)")}><input type="date" value={form.due_date} onChange={set('due_date')} /></Field>
                </>
              )}
              {form.method !== 'Cash' && <Field label={T("Bank")}><input value={form.bank_name} onChange={set('bank_name')} placeholder={T("e.g. HBL, MCB")} /></Field>}
              {editingId && form.method === 'Cheque' && (
                <Field label={T("Cheque status")}>
                  <select value={form.status} onChange={set('status')}>
                    <option value="Pending">{T("Pending")}</option><option value="Cleared">{T("Cleared")}</option><option value="Bounced">{T("Bounced")}</option>
                  </select>
                </Field>
              )}
              <Field label={T("Note")} wide><input value={form.notes} onChange={set('notes')} placeholder={T("e.g. peshgi, final hisaab")} /></Field>
            </div>
            <BalanceHint type={form.party_type} name={form.party_name} />
            {bal ? (
              <button type="button" className="linkbtn" onClick={fillBalance}>{T("Poora baqaya ")}{bal > 0 ? T("ada") : T("wasool")}{T(" karein (")}{rs(Math.abs(bal))})
              </button>
            ) : null}
            <FormActions
              saving={saving}
              editing={!!editingId}
              onCancel={() => { setEditingId(null); setForm(blank()); }}
              saveLabel={T("Payment Save Karein")}
              extra={<button type="button" className="btn gold" disabled={saving} onClick={() => submit(null, true)}>{T("Save + Raseed Print")}</button>}
            />
          </form>
        </Panel>
      )}

      <Panel title={T("Post-dated Cheques (Pending)")}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Cheque #")}</th><th>{T("Party")}</th><th>{T("Len-den")}</th><th className="r">{T("Raqam")}</th><th>{T("Due")}</th><th>{T("Halat")}</th><th>{T("Status badlein")}</th></tr></thead>
            <tbody>
              {chequeRows.length ? chequeRows.map((c) => (
                <tr key={c.id}>
                  <td>{c.cheque_no} {c._pending && <PendingTag />}{c.bank_name ? <div className="muted">{c.bank_name}</div> : null}</td>
                  <td>{c.party_name} <span className="muted">({c.party_type})</span></td>
                  <td>{c.direction === 'Paid' ? T("Diya") : T("Liya")}</td>
                  <td className="r">{rs(c.amount)}</td>
                  <td>{fmtDate(c.due_date)}</td>
                  <td>{statusBadge(c, today)}</td>
                  <td>
                    <select value={c.status} disabled={!canEdit} onChange={(e) => setStatus(c, e.target.value)}>
                      <option value="Pending">{T("Pending")}</option><option value="Cleared">{T("Cleared")}</option><option value="Bounced">{T("Bounced")}</option>
                    </select>
                  </td>
                </tr>
              )) : <Empty colSpan={7} text={T("Koi pending cheque nahi.")} />}
            </tbody>
          </table>
        </div>
        <div className="note">{T("Bounce mark karne par us cheque ki raqam khata se khud hat jati hai. Clear hone par bank balance (Cash Book) mein aa jati hai.")}</div>
      </Panel>

      <Panel
        title={T("Payments Register")}
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => exportCSV('payments.csv', ['Date', 'PartyType', 'Party', 'Direction', 'Method', 'Amount', 'ChequeNo', 'Bank', 'Due', 'Status', 'Notes'],
            filtered.map((p) => [p.date, p.party_type, p.party_name, p.direction, p.method, p.amount, p.cheque_no, p.bank_name, p.due_date, p.status, p.notes]))}>{T("Export CSV")}</button>
        </>}
      >
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder={T("Party, cheque #, bank…")} /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Date")}</th><th>{T("Party")}</th><th>{T("Len-den")}</th><th>{T("Tareeqa")}</th><th className="r">{T("Raqam")}</th><th>{T("Status")}</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={7} text={T("Loading…")} /> : visible.length ? visible.map((p) => (
                <tr key={p.id} className={p.status === 'Bounced' ? 'dim' : ''}>
                  <td>{fmtDate(p.date)} {p._pending && <PendingTag />}</td>
                  <td>{p.party_name} <span className="muted">({p.party_type})</span>{p.notes ? <div className="muted">{p.notes}</div> : null}</td>
                  <td>{p.direction === 'Paid' ? <Badge kind="pos">{T("Diya")}</Badge> : <Badge kind="neg">{T("Liya")}</Badge>}</td>
                  <td>{p.method}{p.cheque_no ? ' #' + p.cheque_no : ''}</td>
                  <td className="r"><b>{rs(p.amount)}</b></td>
                  <td>{p.method === 'Cheque' ? statusBadge(p, today) : <Badge kind="cleared">{T("Done")}</Badge>}</td>
                  <td><RowActions onPrint={() => printPaymentReceipt(p, settings)} onEdit={canEdit ? () => startEdit(p) : null} onDelete={canDel ? () => del(p) : null} /></td>
                </tr>
              )) : <Empty colSpan={7} text={T("Is muddat mein koi payment nahi.")} />}
            </tbody>
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
