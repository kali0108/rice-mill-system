import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { laborCalc, num, fmtNum, rs, sum } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { PAY_TYPES } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, BalanceHint, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions,
  RowActions, Empty, PendingTag, StatCard, Badge, confirmDelete, SyncNote,
} from '../components/ui';
import { T } from '../lib/i18n';

const blank = (prev) => ({
  name: '', date: prev?.date || todayStr(), pay_type: prev?.pay_type || 'Daily', rate_or_wage: prev?.rate_or_wage || '',
  units_or_days: '', advance_deducted: '', paid: false, paid_date: todayStr(), paid_via: 'Cash', notes: '',
});

export default function Labor() {
  const range = useDateRange('labor', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('labor_entries', { from: range.from, to: range.to });
  const unpaidAll = useSupaTable('labor_entries', { eq: { paid: false } });
  const { profile } = useAuth();
  const { canonicalName } = useParties();
  const toast = useToast();
  const writable = can(profile, 'labor', 'add');
  const canEdit = can(profile, 'labor', 'edit');
  const canDel = can(profile, 'labor', 'delete');

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const pt = PAY_TYPES.find((p) => p.value === form.pay_type) || PAY_TYPES[0];
  const c = laborCalc(form);

  const filtered = useMemo(() => rows.filter((l) => (show === 'all' || (show === 'unpaid' ? !l.paid : l.paid)) && matchesSearch(q, l.name, l.notes, l.pay_type)), [rows, q, show]);
  const [visible, more] = useShowMore(filtered);

  const workers = useMemo(() => {
    const m = new Map();
    filtered.forEach((l) => {
      const k = l.name.toLowerCase();
      const w = m.get(k) || { name: l.name, entries: 0, gross: 0, paid: 0, unpaid: 0, advance: 0 };
      w.entries += 1;
      w.gross += Number(l.gross) || 0;
      w.advance += Number(l.advance_deducted) || 0;
      if (l.paid) w.paid += Number(l.net_pay) || 0; else w.unpaid += Number(l.net_pay) || 0;
      m.set(k, w);
    });
    return [...m.values()].sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name));
  }, [filtered]);

  const totalUnpaid = sum(unpaidAll.rows, 'net_pay');

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) return toast.error(T("Mazdoor ka naam likhein."));
    if (num(form.rate_or_wage) <= 0 || num(form.units_or_days) <= 0) return toast.error(T("Rate aur din/bags likhein."));
    if (c.net < 0) return toast.error(T("Advance katoti kul mazdoori se zyada hai."));
    const payload = {
      name: canonicalName('Labor', form.name), date: form.date, pay_type: form.pay_type, rate_or_wage: num(form.rate_or_wage),
      units_or_days: num(form.units_or_days), advance_deducted: num(form.advance_deducted), gross: c.gross, net_pay: c.net,
      paid: !!form.paid, paid_date: form.paid ? form.paid_date || todayStr() : null, paid_via: form.paid_via, notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save — sync baad mein hogi.") : T("Mazdoori save ho gayi."));
    setEditingId(null);
    setForm(blank(form));
  }

  async function togglePaid(l) {
    const paid = !l.paid;
    if (!paid && !window.confirm(`${l.name}${T(" ki adaigi wapas \"unpaid\" karein?")}`)) return;
    const res = await update(l.id, { paid, paid_date: paid ? todayStr() : null, paid_via: l.paid_via || 'Cash' });
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(paid ? `${l.name} — ${rs(l.net_pay)}${T(" ada (Cash Book mein darj).")}` : T("Unpaid mark ho gaya."));
  }

  async function del(l) {
    if (!confirmDelete(`${l.name} — ${fmtDate(l.date)}`)) return;
    const res = await remove(l.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(totalUnpaid)} l={`${T("Kul baqaya mazdoori (")}${unpaidAll.rows.length}${T(" entries)")}`} warn={totalUnpaid > 0} />
        <StatCard n={rs(sum(filtered, 'gross'))} l={T("Is muddat ki kul mazdoori (gross)")} />
        <StatCard n={rs(sum(filtered.filter((l) => l.paid), 'net_pay'))} l={T("Is muddat mein ada")} />
      </div>

      {(writable || (editingId && canEdit)) && (
        <Panel title={editingId ? T("Mazdoori Edit Karein") : T("Nayi Mazdoori Entry")}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label={T("Mazdoor ka naam")}><PartyInput type="Labor" value={form.name} onChange={set('name')} required /></Field>
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label={T("Qisam")}><select value={form.pay_type} onChange={set('pay_type')}>{PAY_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
              <Field label={pt.rate}><NumInput value={form.rate_or_wage} onChange={set('rate_or_wage')} required /></Field>
              <Field label={pt.unit}><NumInput value={form.units_or_days} onChange={set('units_or_days')} required /></Field>
              <Field label={T("Advance katoti (Rs)")} hint={T("Peshgi jo Payments mein di thi")}><NumInput value={form.advance_deducted} onChange={set('advance_deducted')} /></Field>
              <Field label={T("Adaigi")} plain>
                <label className="check"><input type="checkbox" checked={form.paid} onChange={set('paid')} />{T(" Ada ho gayi")}</label>
              </Field>
              {form.paid && (
                <>
                  <Field label={T("Adaigi ki tareekh")}><input type="date" value={form.paid_date} onChange={set('paid_date')} /></Field>
                  <Field label={T("Kaise")}><select value={form.paid_via} onChange={set('paid_via')}><option value="Cash">{T("Cash")}</option><option value="Bank">{T("Bank")}</option></select></Field>
                </>
              )}
              <Field label={T("Note")} wide><input value={form.notes} onChange={set('notes')} placeholder={T("e.g. loading, machine operator")} /></Field>
            </div>
            <div className="calcline">{T("Kul mazdoori: ")}<b>{rs(c.gross)}</b>{T(" · Advance katoti: −")}{rs(form.advance_deducted)}{T(" · Dena: ")}<b>{rs(c.net)}</b></div>
            <BalanceHint type="Labor" name={form.name} />
            <div className="note">{T("Mazdoor ka advance (peshgi) ")}<b>{T("Payments")}</b>{T(" mein \"Labor\" party ko diya hua darj karein; yahan sirf katoti likhein — khata khud barabar ho jata hai.")}</div>
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel={T("Entry Save Karein")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Mazdoor-wise Khulasa (is muddat)")}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Mazdoor")}</th><th className="r">{T("Entries")}</th><th className="r">{T("Kul mazdoori")}</th><th className="r">{T("Advance kata")}</th><th className="r">{T("Ada")}</th><th className="r">{T("Baqaya")}</th><th></th></tr></thead>
            <tbody>
              {workers.length ? workers.map((w) => (
                <tr key={w.name}>
                  <td>{w.name}</td><td className="r">{w.entries}</td><td className="r">{rs(w.gross)}</td><td className="r">{rs(w.advance)}</td>
                  <td className="r">{rs(w.paid)}</td><td className="r"><b>{rs(w.unpaid)}</b></td>
                  <td><Link className="btn small" to={`/statement?type=Labor&name=${encodeURIComponent(w.name)}`}>{T("Khata")}</Link></td>
                </tr>
              )) : <Empty colSpan={7} text={T("Koi entry nahi.")} />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={T("Wage Sheet")}
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => exportCSV('labor.csv', ['Name', 'Date', 'PayType', 'Rate', 'Units', 'Gross', 'Advance', 'NetPay', 'Paid', 'PaidDate', 'PaidVia', 'Notes'],
            filtered.map((l) => [l.name, l.date, l.pay_type, l.rate_or_wage, l.units_or_days, l.gross, l.advance_deducted, l.net_pay, l.paid ? 'Yes' : 'No', l.paid_date, l.paid_via, l.notes]))}>{T("Export CSV")}</button>
        </>}
      >
        <DateRangeBar range={range}>
          <Field label={T("Dikhayein")}>
            <select value={show} onChange={(e) => setShow(e.target.value)}><option value="all">{T("Sab")}</option><option value="unpaid">{T("Sirf baqaya")}</option><option value="paid">{T("Sirf ada")}</option></select>
          </Field>
          <SearchBox value={q} onChange={setQ} placeholder={T("Naam…")} />
        </DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Mazdoor")}</th><th>{T("Date")}</th><th>{T("Qisam")}</th><th className="r">{T("Rate × Din/Bags")}</th><th className="r">{T("Kul")}</th><th className="r">{T("Advance")}</th><th className="r">{T("Dena")}</th><th>{T("Adaigi")}</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={9} text={T("Loading…")} /> : visible.length ? visible.map((l) => (
                <tr key={l.id}>
                  <td>{l.name} {l._pending && <PendingTag />}{l.notes ? <div className="muted">{l.notes}</div> : null}</td>
                  <td>{fmtDate(l.date)}</td>
                  <td>{l.pay_type}</td>
                  <td className="r">{rs(l.rate_or_wage)} × {fmtNum(l.units_or_days)}</td>
                  <td className="r">{rs(l.gross)}</td>
                  <td className="r">{Number(l.advance_deducted) ? rs(l.advance_deducted) : '—'}</td>
                  <td className="r"><b>{rs(l.net_pay)}</b></td>
                  <td>
                    {l.paid ? <Badge kind="cleared">{T("Ada ")}{l.paid_date ? fmtDate(l.paid_date) : ''}</Badge> : <Badge kind="pending">{T("Baqaya")}</Badge>}
                    {canEdit && <button type="button" className="btn small" style={{ marginLeft: 6 }} onClick={() => togglePaid(l)}>{l.paid ? T("Unpaid") : T("Ada karein")}</button>}
                  </td>
                  <td>
                    <RowActions
                      onEdit={canEdit ? () => { setEditingId(l.id); setForm({ name: l.name, date: l.date, pay_type: l.pay_type, rate_or_wage: String(l.rate_or_wage), units_or_days: String(l.units_or_days), advance_deducted: Number(l.advance_deducted) ? String(l.advance_deducted) : '', paid: !!l.paid, paid_date: l.paid_date || todayStr(), paid_via: l.paid_via || 'Cash', notes: l.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={canDel ? () => del(l) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={9} text={T("Is muddat mein koi entry nahi.")} />}
            </tbody>
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
