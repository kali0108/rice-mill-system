import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc } from '../hooks/useRpc';
import { useAuth } from '../context/AuthContext';
import { useParties, useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
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
import { T } from '../lib/i18n';

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
  const canSale = can(profile, 'sales', 'add');
  const canPurchase = can(profile, 'purchase', 'add');
  const canK = (kind, action) => can(profile, kind === 'sale' ? 'sales' : 'purchase', action);
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
  const writableForKind = (k) => canK(k, editingId ? 'edit' : 'add');
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
    if (!writableForKind(form.kind)) return toast.error(T("Is qisam ke saude ki ijazat nahi."));
    if (!form.party_name.trim()) return toast.error(T("Party ka naam likhein."));
    if (qtyKg <= 0) return toast.error(T("Miqdar likhein."));
    if (form.currency !== 'PKR' && num(form.fx_rate) <= 0) return toast.error(`${T("Exchange rate likhein (1 ")}${form.currency}${T(" = kitne Rs).")}`);
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
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save — sync baad mein hogi.") : `${T("Sauda save ho gaya")}${res.data?.contract_no ? ' — ' + res.data.contract_no : ''}.`);
    setEditingId(null);
    setForm(blank(form.kind));
  }

  async function setStatus(c, status) {
    const res = await update(c.id, { status });
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(`${T("Sauda ")}${status === 'Completed' ? T("mukammal") : status === 'Cancelled' ? T("cancel") : T("phir se open")}.`);
  }

  async function del(c) {
    if (c.delivered > 0) return toast.error(T("Is saude par maal aa/ja chuka hai — Cancel ya Completed karein."));
    if (!confirmDelete(c.contract_no || c.party_name)) return;
    const res = await remove(c.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={openSale.length} l={`${T("Open sale saude · baqi ")}${fmt(openSale.reduce((s, c) => s + c.pending, 0) / 1000, 1)}${T(" MT")}`} />
        <StatCard n={openPurchase.length} l={`${T("Open kharid saude · baqi ")}${fmt(openPurchase.reduce((s, c) => s + c.pending, 0) / 40, 0)}${T(" md")}`} />
        <StatCard n={enriched.filter((c) => c.overdue).length} l={T("Delivery ki tareekh guzar gayi")} warn={enriched.some((c) => c.overdue)} />
      </div>

      {(canSale || canPurchase || (editingId && canK(form.kind, 'edit'))) && (
        <Panel title={editingId ? T("Sauda Edit Karein") : T("Naya Sauda (Contract / Booking)")}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label={T("Qisam")}>
                <select value={form.kind} onChange={(e) => setForm(blank(e.target.value))} disabled={!!editingId}>
                  {canSale && <option value="sale">{T("Sale sauda (customer / export buyer)")}</option>}
                  {canPurchase && <option value="purchase">{T("Kharid sauda (Arhti / Kisan se paddy)")}</option>}
                </select>
              </Field>
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              {form.kind === 'purchase' && (
                <Field label={T("Party type")}><select value={form.party_type} onChange={set('party_type')}><option value="Arhti">{T("Arhti")}</option><option value="Kisan">{T("Kisan")}</option></select></Field>
              )}
              <Field label={form.kind === 'sale' ? T("Customer / Buyer") : T("Arhti / Kisan")}>
                <PartyInput type={form.kind === 'sale' ? 'Customer' : form.party_type} value={form.party_name} onChange={set('party_name')} required />
              </Field>
              {form.kind === 'sale' && <Field label={T("Maal")}><ProductSelect value={form.item} onChange={set('item')} required /></Field>}
              <Field label={T("Variety")}><VarietySelect value={form.variety} onChange={set('variety')} /></Field>
              <Field label={T("Miqdar")}>
                <div className="inline-2">
                  <NumInput value={form.qty} onChange={set('qty')} required />
                  <select value={form.qty_unit} onChange={set('qty_unit')} aria-label={T("Miqdar ki unit")}><option value="mt">{T("MT")}</option><option value="maund">{T("Maund")}</option><option value="kg">{T("kg")}</option></select>
                </div>
              </Field>
              <Field label={T("Rate")}>
                <div className="inline-2">
                  <NumInput value={form.rate} onChange={set('rate')} required />
                  <select value={form.rate_unit} onChange={set('rate_unit')} aria-label={T("Rate ki unit")}>{RATE_UNITS.map((u) => <option key={u.value} value={u.value}>{RATE_UNIT_SHORT[u.value]}</option>)}</select>
                </div>
              </Field>
              <Field label={T("Currency")}><select value={form.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              {form.currency !== 'PKR' && <Field label={`1 ${form.currency}${T(" = kitne Rs")}`}><NumInput value={form.fx_rate} onChange={set('fx_rate')} required /></Field>}
              <Field label={T("Delivery shuru")}><input type="date" value={form.delivery_from} onChange={set('delivery_from')} /></Field>
              <Field label={T("Delivery aakhri tareekh")}><input type="date" value={form.delivery_to} onChange={set('delivery_to')} /></Field>
              <Field label={T("Payment terms")}><ListInput value={form.payment_terms} onChange={set('payment_terms')} options={PAYMENT_TERMS} /></Field>
              {editingId && <Field label={T("Status")}><select value={form.status} onChange={set('status')}>{CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>}
              <Field label={T("Note")} wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            <div className="calcline">
              {fmt(qtyKg, 0)}{T(" kg = ")}<b>{fmt(qtyKg / 1000, 3)}{T(" MT")}</b> = <b>{fmt(qtyKg / 40, 2)}{T(" maund")}</b>{T(" · Saude ki value: ")}<b>{money(value.fc, form.currency)}</b>
              {form.currency !== 'PKR' ? <> = <b>{rs(value.pkr)}</b></> : null}
            </div>
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank(form.kind)); }} saveLabel={T("Sauda Save Karein")} />
          </form>
        </Panel>
      )}

      <Panel
        title={T("Saude")}
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => exportCSV('contracts.csv', ['No', 'Date', 'Kind', 'Party', 'Item', 'Variety', 'QtyKg', 'DeliveredKg', 'PendingKg', 'Rate', 'Unit', 'Currency', 'FX', 'DeliveryTo', 'Terms', 'Status'],
            filtered.map((c) => [c.contract_no, c.date, c.kind, c.party_name, c.item, c.variety, c.qty_kg, c.delivered, c.pending, c.rate, c.rate_unit, c.currency, c.fx_rate, c.delivery_to, c.payment_terms, c.status]))}>{T("Export CSV")}</button>
        </>}
      >
        <div className="filterbar">
          <Field label={T("Qisam")}><select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="all">{T("Sab")}</option><option value="sale">{T("Sale")}</option><option value="purchase">{T("Kharid")}</option></select></Field>
          <Field label={T("Status")}><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">{T("Sab")}</option>{CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <SearchBox value={q} onChange={setQ} placeholder={T("Sauda #, party, variety…")} />
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Sauda")}</th><th>{T("Party")}</th><th>{T("Maal")}</th><th className="r">{T("Miqdar")}</th><th className="r">{T("Rate")}</th><th style={{ minWidth: 150 }}>{T("Progress")}</th><th>{T("Delivery")}</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={8} text={T("Loading…")} /> : visible.length ? visible.map((c) => (
                <tr key={c.id} className={c.status === 'Cancelled' ? 'dim' : ''}>
                  <td><b>{c.contract_no || '—'}</b> {c._pending && <PendingTag />}<div className="muted">{fmtDate(c.date)} · {c.kind === 'sale' ? T("Sale") : T("Kharid")}</div></td>
                  <td>{c.party_name}<div className="muted">{c.party_type}{c.payment_terms ? ' · ' + c.payment_terms : ''}</div></td>
                  <td>{c.item}{c.variety ? <div className="muted">{c.variety}</div> : null}</td>
                  <td className="r">{fmt(rateUnits(c.qty_kg, c.rate_unit), 2)} {RATE_UNIT_SHORT[c.rate_unit]}<div className="muted">{fmt(c.qty_kg, 0)}{T(" kg")}</div></td>
                  <td className="r">{money(c.rate, c.currency)}/{RATE_UNIT_SHORT[c.rate_unit]}</td>
                  <td>
                    <ProgressBar pct={c.pct} warn={c.overdue} />
                    <div className="muted">{fmt(c.delivered, 0)}{T(" kg ")}{c.kind === 'sale' ? T("rawana") : T("wasool")}{T(" · baqi ")}{fmt(c.pending, 0)}{T(" kg")}</div>
                  </td>
                  <td>
                    {c.delivery_to ? fmtDate(c.delivery_to) : '—'}{' '}
                    {c.status !== 'Open' ? <Badge kind={c.status === 'Completed' ? 'cleared' : 'zero'}>{c.status}</Badge>
                      : c.overdue ? <Badge kind="bounced">{T("Overdue")}</Badge> : c.pending <= 0.01 ? <Badge kind="cleared">{T("Pura")}</Badge> : <Badge kind="pending">{T("Open")}</Badge>}
                  </td>
                  <td>
                    <RowActions
                      onPrint={() => printContract(c, settings, findParty(c.party_type, c.party_name), c.delivered)}
                      onEdit={canK(c.kind, 'edit') ? () => startEdit(c) : null}
                      onDelete={canK(c.kind, 'delete') ? () => del(c) : null}
                      extra={canK(c.kind, 'edit') ? (c.status === 'Open'
                        ? <button type="button" className="btn small" onClick={() => setStatus(c, 'Completed')}>{T("Mukammal")}</button>
                        : <button type="button" className="btn small" onClick={() => setStatus(c, 'Open')}>{T("Open karein")}</button>) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={8} text={T("Koi sauda nahi.")} />}
            </tbody>
          </table>
        </div>
        {more}
        <div className="note">{T("Sale bill ya kharid banate waqt sauda chunein — maal rawana/wasool hote hi progress khud barhti hai. Season reset (carry forward) par baqi saude agle season mein chale jaate hain.")}</div>
      </Panel>
    </>
  );
}
