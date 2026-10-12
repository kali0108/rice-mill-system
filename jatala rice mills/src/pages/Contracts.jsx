import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc } from '../hooks/useRpc';
import { useAuth } from '../context/AuthContext';
import { useParties, useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { num, fmt, rs, contractValue, money, rateUnits } from '../lib/calc';
import { todayStr, fmtDate, daysBetween } from '../lib/dates';
import { CURRENCIES, RATE_UNITS, RATE_UNIT_SHORT, PAYMENT_TERMS, CONTRACT_STATUSES } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printContract } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, VarietySelect, ProductSelect, ListInput, SearchBox, matchesSearch, useShowMore,
  FormActions, RowActions, Empty, PendingTag, Badge, StatCard, confirmDelete, SyncNote,
} from '../components/ui';
import { ProgressBar } from '../components/charts';

const QTY_UNITS = { kg: 1, maund: 40, mt: 1000 };

const blank = (kind) => ({
  kind, date: todayStr(), party_type: kind === 'sale' ? 'Customer' : 'Arhti', party_name: '', item: kind === 'sale' ? 'Rice - Full Grain' : 'Paddy',
  variety: '', qty: '', qty_unit: kind === 'sale' ? 'mt' : 'maund', rate: '', rate_unit: kind === 'sale' ? 'mt' : 'maund',
  currency: 'PKR', fx_rate: '', delivery_from: todayStr(), delivery_to: '', payment_terms: '', status: 'Open', notes: '',
});

export default function Contracts() {
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('contracts', { orderBy: 'date' });
  const progress = useRpc('get_contract_progress', {}, { watch: ['sales', 'purchases', 'contracts'] });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { canonicalName, findParty } = useParties();
  const toast = useToast();
  const canSale = canWrite(profile, 'sales');
  const canPurchase = canWrite(profile, 'purchase');
  const t = todayStr();

  const [form, setForm] = useState(() => blank(canSale || !canPurchase ? 'sale' : 'purchase'));
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const prog = useMemo(() => new Map((progress.data || []).map((p) => [p.contract_id, p])), [progress.data]);
  const enriched = useMemo(() => rows.map((c) => {
    const p = prog.get(c.id);
    const delivered = p ? Number(p.delivered_kg) : 0;
    const pending = Math.max(Number(c.qty_kg) - delivered, 0);
    const overdue = c.status === 'Open' && pending > 0.01 && c.delivery_to && daysBetween(t, c.delivery_to) < 0;
    return { ...c, delivered, pending, pct: Number(c.qty_kg) ? (delivered / Number(c.qty_kg)) * 100 : 0, overdue, lastDate: p?.last_date };
  }), [rows, prog, t]);
  const filtered = enriched.filter((c) => (kindFilter === 'all' || c.kind === kindFilter) && (statusFilter === 'all' || c.status === statusFilter)
    && matchesSearch(q, c.contract_no, c.party_name, c.item, c.variety, c.notes, c.payment_terms));
  const [visible, more] = useShowMore(filtered);

  const qtyKg = num(form.qty) * QTY_UNITS[form.qty_unit];
  const value = contractValue({ qty_kg: qtyKg, rate: form.rate, rate_unit: form.rate_unit, currency: form.currency, fx_rate: form.fx_rate });
  const writableForKind = (k) => (k === 'sale' ? canSale : canPurchase);
  const openSale = enriched.filter((c) => c.kind === 'sale' && c.status === 'Open');
  const openPurchase = enriched.filter((c) => c.kind === 'purchase' && c.status === 'Open');

  function startEdit(c) {
    setEditingId(c.id);
    const unit = c.rate_unit || 'maund';
    setForm({
      kind: c.kind, date: c.date, party_type: c.party_type, party_name: c.party_name, item: c.item, variety: c.variety || '',
      qty: String(Number(c.qty_kg) / QTY_UNITS[unit]), qty_unit: unit, rate: String(c.rate), rate_unit: unit, currency: c.currency || 'PKR',
      fx_rate: c.currency && c.currency !== 'PKR' ? String(c.fx_rate) : '', delivery_from: c.delivery_from || '', delivery_to: c.delivery_to || '',
      payment_terms: c.payment_terms || '', status: c.status, notes: c.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!writableForKind(form.kind)) return toast.error('Is qisam ke saude ki ijazat nahi.');
    if (!form.party_name.trim()) return toast.error('Party ka naam likhein.');
    if (qtyKg <= 0) return toast.error('Miqdar likhein.');
    if (form.currency !== 'PKR' && num(form.fx_rate) <= 0) return toast.error(`Exchange rate likhein (1 ${form.currency} = kitne Rs).`);
    const payload = {
      kind: form.kind, date: form.date, party_type: form.kind === 'sale' ? 'Customer' : form.party_type,
      party_name: canonicalName(form.kind === 'sale' ? 'Customer' : form.party_type, form.party_name), item: form.kind === 'sale' ? form.item : 'Paddy',
      variety: form.variety, qty_kg: Math.round(qtyKg * 100) / 100, rate: num(form.rate), rate_unit: form.rate_unit, currency: form.currency,
      fx_rate: form.currency === 'PKR' ? 1 : num(form.fx_rate), delivery_from: form.delivery_from || null, delivery_to: form.delivery_to || null,
      payment_terms: form.payment_terms.trim(), status: form.status, notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success(res.queued ? 'Offline save — sync baad mein hogi.' : `Sauda save ho gaya${res.data?.contract_no ? ' — ' + res.data.contract_no : ''}.`);
    setEditingId(null);
    setForm(blank(form.kind));
  }

  async function setStatus(c, status) {
    const res = await update(c.id, { status });
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(`Sauda ${status === 'Completed' ? 'mukammal' : status === 'Cancelled' ? 'cancel' : 'phir se open'}.`);
  }

  async function del(c) {
    if (c.delivered > 0) return toast.error('Is saude par maal aa/ja chuka hai — Cancel ya Completed karein.');
    if (!confirmDelete(c.contract_no || c.party_name)) return;
    const res = await remove(c.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={openSale.length} l={`Open sale saude · baqi ${fmt(openSale.reduce((s, c) => s + c.pending, 0) / 1000, 1)} MT`} />
        <StatCard n={openPurchase.length} l={`Open kharid saude · baqi ${fmt(openPurchase.reduce((s, c) => s + c.pending, 0) / 40, 0)} md`} />
        <StatCard n={enriched.filter((c) => c.overdue).length} l="Delivery ki tareekh guzar gayi" warn={enriched.some((c) => c.overdue)} />
      </div>

      {(canSale || canPurchase) && (
        <Panel title={editingId ? 'Sauda Edit Karein' : 'Naya Sauda (Contract / Booking)'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Qisam">
                <select value={form.kind} onChange={(e) => setForm(blank(e.target.value))} disabled={!!editingId}>
                  {canSale && <option value="sale">Sale sauda (customer / export buyer)</option>}
                  {canPurchase && <option value="purchase">Kharid sauda (Arhti / Kisan se paddy)</option>}
                </select>
              </Field>
              <Field label="Tareekh"><input type="date" value={form.date} onChange={set('date')} required /></Field>
              {form.kind === 'purchase' && (
                <Field label="Party type"><select value={form.party_type} onChange={set('party_type')}><option value="Arhti">Arhti</option><option value="Kisan">Kisan</option></select></Field>
              )}
              <Field label={form.kind === 'sale' ? 'Customer / Buyer' : 'Arhti / Kisan'}>
                <PartyInput type={form.kind === 'sale' ? 'Customer' : form.party_type} value={form.party_name} onChange={set('party_name')} required />
              </Field>
              {form.kind === 'sale' && <Field label="Maal"><ProductSelect value={form.item} onChange={set('item')} required /></Field>}
              <Field label="Variety"><VarietySelect value={form.variety} onChange={set('variety')} /></Field>
              <Field label="Miqdar">
                <div className="inline-2">
                  <NumInput value={form.qty} onChange={set('qty')} required />
                  <select value={form.qty_unit} onChange={set('qty_unit')} aria-label="Miqdar ki unit"><option value="mt">MT</option><option value="maund">Maund</option><option value="kg">kg</option></select>
                </div>
              </Field>
              <Field label="Rate">
                <div className="inline-2">
                  <NumInput value={form.rate} onChange={set('rate')} required />
                  <select value={form.rate_unit} onChange={set('rate_unit')} aria-label="Rate ki unit">{RATE_UNITS.map((u) => <option key={u.value} value={u.value}>{RATE_UNIT_SHORT[u.value]}</option>)}</select>
                </div>
              </Field>
              <Field label="Currency"><select value={form.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              {form.currency !== 'PKR' && <Field label={`1 ${form.currency} = kitne Rs`}><NumInput value={form.fx_rate} onChange={set('fx_rate')} required /></Field>}
              <Field label="Delivery shuru"><input type="date" value={form.delivery_from} onChange={set('delivery_from')} /></Field>
              <Field label="Delivery aakhri tareekh"><input type="date" value={form.delivery_to} onChange={set('delivery_to')} /></Field>
              <Field label="Payment terms"><ListInput value={form.payment_terms} onChange={set('payment_terms')} options={PAYMENT_TERMS} /></Field>
              {editingId && <Field label="Status"><select value={form.status} onChange={set('status')}>{CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>}
              <Field label="Note" wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            <div className="calcline">
              {fmt(qtyKg, 0)} kg = <b>{fmt(qtyKg / 1000, 3)} MT</b> = <b>{fmt(qtyKg / 40, 2)} maund</b> · Saude ki value: <b>{money(value.fc, form.currency)}</b>
              {form.currency !== 'PKR' ? <> = <b>{rs(value.pkr)}</b></> : null}
            </div>
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank(form.kind)); }} saveLabel="Sauda Save Karein" />
          </form>
        </Panel>
      )}

      <Panel
        title="Saude"
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => exportCSV('contracts.csv', ['No', 'Date', 'Kind', 'Party', 'Item', 'Variety', 'QtyKg', 'DeliveredKg', 'PendingKg', 'Rate', 'Unit', 'Currency', 'FX', 'DeliveryTo', 'Terms', 'Status'],
            filtered.map((c) => [c.contract_no, c.date, c.kind, c.party_name, c.item, c.variety, c.qty_kg, c.delivered, c.pending, c.rate, c.rate_unit, c.currency, c.fx_rate, c.delivery_to, c.payment_terms, c.status]))}>Export CSV</button>
        </>}
      >
        <div className="filterbar">
          <Field label="Qisam"><select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="all">Sab</option><option value="sale">Sale</option><option value="purchase">Kharid</option></select></Field>
          <Field label="Status"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Sab</option>{CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <SearchBox value={q} onChange={setQ} placeholder="Sauda #, party, variety…" />
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Sauda</th><th>Party</th><th>Maal</th><th className="r">Miqdar</th><th className="r">Rate</th><th style={{ minWidth: 150 }}>Progress</th><th>Delivery</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={8} text="Loading…" /> : visible.length ? visible.map((c) => (
                <tr key={c.id} className={c.status === 'Cancelled' ? 'dim' : ''}>
                  <td><b>{c.contract_no || '—'}</b> {c._pending && <PendingTag />}<div className="muted">{fmtDate(c.date)} · {c.kind === 'sale' ? 'Sale' : 'Kharid'}</div></td>
                  <td>{c.party_name}<div className="muted">{c.party_type}{c.payment_terms ? ' · ' + c.payment_terms : ''}</div></td>
                  <td>{c.item}{c.variety ? <div className="muted">{c.variety}</div> : null}</td>
                  <td className="r">{fmt(rateUnits(c.qty_kg, c.rate_unit), 2)} {RATE_UNIT_SHORT[c.rate_unit]}<div className="muted">{fmt(c.qty_kg, 0)} kg</div></td>
                  <td className="r">{money(c.rate, c.currency)}/{RATE_UNIT_SHORT[c.rate_unit]}</td>
                  <td>
                    <ProgressBar pct={c.pct} warn={c.overdue} />
                    <div className="muted">{fmt(c.delivered, 0)} kg {c.kind === 'sale' ? 'rawana' : 'wasool'} · baqi {fmt(c.pending, 0)} kg</div>
                  </td>
                  <td>
                    {c.delivery_to ? fmtDate(c.delivery_to) : '—'}{' '}
                    {c.status !== 'Open' ? <Badge kind={c.status === 'Completed' ? 'cleared' : 'zero'}>{c.status}</Badge>
                      : c.overdue ? <Badge kind="bounced">Overdue</Badge> : c.pending <= 0.01 ? <Badge kind="cleared">Pura</Badge> : <Badge kind="pending">Open</Badge>}
                  </td>
                  <td>
                    <RowActions
                      onPrint={() => printContract(c, settings, findParty(c.party_type, c.party_name), c.delivered)}
                      onEdit={writableForKind(c.kind) ? () => startEdit(c) : null}
                      onDelete={writableForKind(c.kind) ? () => del(c) : null}
                      extra={writableForKind(c.kind) ? (c.status === 'Open'
                        ? <button type="button" className="btn small" onClick={() => setStatus(c, 'Completed')}>Mukammal</button>
                        : <button type="button" className="btn small" onClick={() => setStatus(c, 'Open')}>Open karein</button>) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={8} text="Koi sauda nahi." />}
            </tbody>
          </table>
        </div>
        {more}
        <div className="note">Sale bill ya kharid banate waqt sauda chunein — maal rawana/wasool hote hi progress khud barhti hai. Season reset (carry forward) par baqi saude agle season mein chale jaate hain.</div>
      </Panel>
    </>
  );
}
