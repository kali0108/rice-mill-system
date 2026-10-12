import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { transportCalc, num, fmtNum, rs, sum } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { TRANSPORT_TYPES, PAID_VIA, transportPartyType } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, BalanceHint, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions,
  RowActions, Empty, PendingTag, StatCard, Badge, confirmDelete, SyncNote,
} from '../components/ui';

const blank = (prev) => ({
  date: prev?.date || todayStr(), entry_type: prev?.entry_type || 'Delivery', vehicle_no: '', driver_name: '', party_name: '',
  from_location: '', to_location: '', item: '', qty_kg: '', freight_rate_per_kg: '', commission_base_amount: '', commission_pct: '',
  paid_via: prev?.paid_via || 'Cash', notes: '',
});

function toForm(t) {
  const v = (x) => (x == null || Number(x) === 0 ? '' : String(x));
  return {
    date: t.date, entry_type: t.entry_type, vehicle_no: t.vehicle_no || '', driver_name: t.driver_name || '', party_name: t.party_name || '',
    from_location: t.from_location || '', to_location: t.to_location || '', item: t.item || '', qty_kg: v(t.qty_kg),
    freight_rate_per_kg: v(t.freight_rate_per_kg), commission_base_amount: v(t.commission_base_amount), commission_pct: v(t.commission_pct),
    paid_via: t.paid_via || 'Cash', notes: t.notes || '',
  };
}

export default function Transport() {
  const range = useDateRange('transport', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('transport_entries', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const { canonicalName } = useParties();
  const toast = useToast();
  const writable = canWrite(profile, 'transport');

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const partyType = transportPartyType(form.entry_type);
  const isCommission = /Commission/.test(form.entry_type);
  // commission entries carry no freight (hidden fields must not count)
  const eff = isCommission ? { ...form, qty_kg: '', freight_rate_per_kg: '' } : form;
  const c = transportCalc(eff);

  const filtered = useMemo(() => rows.filter((t) => matchesSearch(q, t.vehicle_no, t.driver_name, t.party_name, t.from_location, t.to_location, t.item, t.notes, t.entry_type)), [rows, q]);
  const [visible, more] = useShowMore(filtered);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (c.total <= 0) return toast.error('Freight (wazan × rate) ya commission ki raqam likhein.');
    if (form.paid_via === 'Udhaar' && !form.party_name.trim()) return toast.error('Udhaar ke liye party ka naam likhein.');
    const payload = {
      date: form.date, entry_type: form.entry_type, vehicle_no: form.vehicle_no.trim().toUpperCase(), driver_name: form.driver_name.trim(),
      party_name: form.party_name.trim() ? canonicalName(partyType, form.party_name) : '', from_location: form.from_location.trim(),
      to_location: form.to_location.trim(), item: form.item.trim(), qty_kg: num(eff.qty_kg), freight_rate_per_kg: num(eff.freight_rate_per_kg),
      freight_amount: c.freightAmount, commission_base_amount: num(form.commission_base_amount), commission_pct: num(form.commission_pct),
      commission_amount: c.commissionAmount, total_amount: c.total, paid_via: form.paid_via, notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success(res.queued ? 'Offline save — sync baad mein hogi.' : 'Transport entry save ho gayi.');
    setEditingId(null);
    setForm(blank(form));
  }

  async function del(t) {
    if (!confirmDelete(`${t.entry_type} ${t.vehicle_no || ''}`)) return;
    const res = await remove(t.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={rs(sum(filtered, 'freight_amount'))} l="Kul kiraya (freight)" />
        <StatCard n={rs(sum(filtered, 'commission_amount'))} l="Kul commission" />
        <StatCard n={rs(sum(filtered.filter((t) => t.paid_via === 'Udhaar'), 'total_amount'))} l="Udhaar (party khata mein)" />
      </div>

      {writable && (
        <Panel title={editingId ? 'Transport Entry Edit' : 'Nayi Transport / Commission Entry'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label="Qisam"><select value={form.entry_type} onChange={set('entry_type')}>{TRANSPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label={partyType === 'Transporter' ? 'Transporter / goods company' : partyType === 'Arhti' ? 'Arhti ka naam' : 'Broker / dalal'}>
                <PartyInput type={partyType} value={form.party_name} onChange={set('party_name')} required={form.paid_via === 'Udhaar'} />
              </Field>
              {!isCommission && (
                <>
                  <Field label="Gaari #"><input value={form.vehicle_no} onChange={set('vehicle_no')} placeholder="e.g. LES-4021" /></Field>
                  <Field label="Driver"><input value={form.driver_name} onChange={set('driver_name')} /></Field>
                  <Field label="Kahan se"><input value={form.from_location} onChange={set('from_location')} /></Field>
                  <Field label="Kahan tak"><input value={form.to_location} onChange={set('to_location')} /></Field>
                  <Field label="Saman"><input value={form.item} onChange={set('item')} placeholder="e.g. Chawal bags" /></Field>
                  <Field label="Wazan (kg)"><NumInput value={form.qty_kg} onChange={set('qty_kg')} /></Field>
                  <Field label="Kiraya rate (Rs/kg)"><NumInput value={form.freight_rate_per_kg} onChange={set('freight_rate_per_kg')} /></Field>
                </>
              )}
              <Field label="Commission kis raqam par (Rs)"><NumInput value={form.commission_base_amount} onChange={set('commission_base_amount')} /></Field>
              <Field label="Commission %"><NumInput value={form.commission_pct} onChange={set('commission_pct')} /></Field>
              <Field label="Adaigi"><select value={form.paid_via} onChange={set('paid_via')}>{PAID_VIA.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
              <Field label="Note" wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            <div className="calcline">Kiraya: <b>{rs(c.freightAmount)}</b> · Commission: <b>{rs(c.commissionAmount)}</b> · Kul: <b>{rs(c.total)}</b> ({form.paid_via === 'Udhaar' ? 'party ke khata mein jama' : `${form.paid_via} se ada — Rokar mein`})</div>
            {form.paid_via === 'Udhaar' && <BalanceHint type={partyType} name={form.party_name} />}
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel="Entry Save Karein" />
          </form>
        </Panel>
      )}

      <Panel
        title="Transport Register"
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => exportCSV('transport.csv', ['Date', 'Type', 'Party', 'Vehicle', 'Driver', 'From', 'To', 'Item', 'Kg', 'Rate', 'Freight', 'CommBase', 'Comm%', 'Commission', 'Total', 'PaidVia', 'Notes'],
            filtered.map((t) => [t.date, t.entry_type, t.party_name, t.vehicle_no, t.driver_name, t.from_location, t.to_location, t.item, t.qty_kg, t.freight_rate_per_kg, t.freight_amount, t.commission_base_amount, t.commission_pct, t.commission_amount, t.total_amount, t.paid_via, t.notes]))}>Export CSV</button>
        </>}
      >
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder="Gaari, party, route…" /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Qisam</th><th>Party / Gaari</th><th>Route</th><th className="r">Kg</th><th className="r">Kiraya</th><th className="r">Commission</th><th>Adaigi</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={9} text="Loading…" /> : visible.length ? visible.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)} {t._pending && <PendingTag />}</td>
                  <td>{t.entry_type}</td>
                  <td>{t.party_name || '—'}{t.vehicle_no ? <div className="muted">{t.vehicle_no}{t.driver_name ? ' · ' + t.driver_name : ''}</div> : null}</td>
                  <td>{t.from_location || t.to_location ? `${t.from_location || '—'} → ${t.to_location || '—'}` : '—'}</td>
                  <td className="r">{Number(t.qty_kg) ? fmtNum(t.qty_kg) : '—'}</td>
                  <td className="r">{rs(t.freight_amount)}</td>
                  <td className="r">{Number(t.commission_amount) ? rs(t.commission_amount) : '—'}</td>
                  <td><Badge kind={t.paid_via === 'Udhaar' ? 'pos' : 'zero'}>{t.paid_via}</Badge></td>
                  <td><RowActions onEdit={writable ? () => { setEditingId(t.id); setForm(toForm(t)); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null} onDelete={writable ? () => del(t) : null} /></td>
                </tr>
              )) : <Empty colSpan={9} text="Is muddat mein koi entry nahi." />}
            </tbody>
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
