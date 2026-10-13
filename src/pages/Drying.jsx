import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { num, fmt, fmtNum, pct, kgToMaund, sum } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { DRYING_METHODS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, VarietySelect, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions, RowActions,
  Empty, PendingTag, StatCard, confirmDelete, SyncNote,
} from '../components/ui';
import { T } from '../lib/i18n';

const blank = (prev) => ({
  date: prev?.date || todayStr(), variety: prev?.variety || '', lot_ref: '', method: prev?.method || 'Dhoop (sun)',
  weight_before_kg: '', weight_after_kg: '', moisture_before: '', moisture_after: '', notes: '',
});

export default function Drying() {
  const range = useDateRange('drying', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('drying_batches', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const toast = useToast();
  const writable = can(profile, 'production', 'add');
  const canEdit = can(profile, 'production', 'edit');
  const canDel = can(profile, 'production', 'delete');
  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const before = num(form.weight_before_kg);
  const after = num(form.weight_after_kg);
  const loss = Math.max(before - after, 0);
  const filtered = useMemo(() => rows.filter((d) => matchesSearch(q, d.variety, d.lot_ref, d.method, d.notes)), [rows, q]);
  const [visible, more] = useShowMore(filtered);
  const totBefore = sum(filtered, 'weight_before_kg');
  const totLoss = sum(filtered, 'loss_kg');

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.variety) return toast.error(T("Paddy ki variety chunein."));
    if (before <= 0 || after <= 0) return toast.error(T("Sukhai se pehle aur baad ka wazan likhein."));
    if (after > before) return toast.error(T("Baad ka wazan pehle se zyada nahi ho sakta."));
    const payload = {
      date: form.date, variety: form.variety, lot_ref: form.lot_ref.trim(), method: form.method, weight_before_kg: before,
      weight_after_kg: after, loss_kg: Math.round(loss * 100) / 100, moisture_before: num(form.moisture_before),
      moisture_after: num(form.moisture_after), notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save — sync baad mein hogi.") : `${T("Sukhai darj — ")}${fmtNum(loss)}${T(" kg paddy stock se kam.")}`);
    setEditingId(null);
    setForm(blank(form));
  }

  async function del(d) {
    if (!confirmDelete(`${d.variety} ${fmtDate(d.date)}`)) return;
    const res = await remove(d.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={`${fmt(kgToMaund(totBefore), 0)}${T(" md")}`} l={T("Sukhai mein dali paddy (is muddat)")} />
        <StatCard n={`${fmtNum(totLoss)}${T(" kg")}`} l={`${T("Wazan mein kami — ")}${fmt(kgToMaund(totLoss), 1)}${T(" md")}`} warn={totLoss > 0} />
        <StatCard n={pct(totBefore ? (totLoss / totBefore) * 100 : 0)} l={T("Ausat kami %")} />
      </div>
      {(writable || (editingId && canEdit)) && (
        <Panel title={editingId ? T("Sukhai Entry Edit") : T("Paddy Sukhai (Drying) — nayi entry")}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label={T("Paddy variety")}><VarietySelect value={form.variety} onChange={set('variety')} required /></Field>
              <Field label={T("Dher / Lot")}><input value={form.lot_ref} onChange={set('lot_ref')} placeholder={T("e.g. Dher 3, Godown 2")} /></Field>
              <Field label={T("Tareeqa")}><select value={form.method} onChange={set('method')}>{DRYING_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
              <Field label={T("Sukhai se pehle wazan (kg)")}><NumInput value={form.weight_before_kg} onChange={set('weight_before_kg')} required /></Field>
              <Field label={T("Sukhai ke baad wazan (kg)")}><NumInput value={form.weight_after_kg} onChange={set('weight_after_kg')} required /></Field>
              <Field label={T("Moisture pehle %")}><NumInput value={form.moisture_before} onChange={set('moisture_before')} /></Field>
              <Field label={T("Moisture baad mein %")}><NumInput value={form.moisture_after} onChange={set('moisture_after')} /></Field>
              <Field label={T("Note")} wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            <div className="calcline">{T("Kami: ")}<b>{fmtNum(loss)}{T(" kg")}</b> ({fmt(kgToMaund(loss), 2)}{T(" md) · ")}{pct(before ? (loss / before) * 100 : 0)}{T(" — yeh paddy stock se khud kam ho jayegi.")}</div>
            <div className="note">{T("Sukhai ka kharcha (mazdoor, dryer ka fuel) Labor / Kharche mein \"Sukhai / Drying\" category se darj karein — Laagat report mein shamil hota hai.")}</div>
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel={T("Sukhai Save Karein")} />
          </form>
        </Panel>
      )}
      <Panel title={T("Sukhai Register")} action={<>
        <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
        <button type="button" className="btn small" onClick={() => exportCSV('drying.csv', ['Date', 'Variety', 'Lot', 'Method', 'BeforeKg', 'AfterKg', 'LossKg', 'MoistureBefore', 'MoistureAfter', 'Notes'],
          filtered.map((d) => [d.date, d.variety, d.lot_ref, d.method, d.weight_before_kg, d.weight_after_kg, d.loss_kg, d.moisture_before, d.moisture_after, d.notes]))}>{T("Export CSV")}</button>
      </>}>
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder={T("Variety, dher…")} /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Date")}</th><th>{T("Variety / Dher")}</th><th>{T("Tareeqa")}</th><th className="r">{T("Pehle")}</th><th className="r">{T("Baad")}</th><th className="r">{T("Kami")}</th><th className="r">{T("Moisture")}</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={8} text={T("Loading…")} /> : visible.length ? visible.map((d) => (
                <tr key={d.id}>
                  <td>{fmtDate(d.date)} {d._pending && <PendingTag />}</td>
                  <td>{d.variety}{d.lot_ref ? <div className="muted">{d.lot_ref}</div> : null}</td>
                  <td>{d.method}</td>
                  <td className="r">{fmtNum(d.weight_before_kg)}</td>
                  <td className="r">{fmtNum(d.weight_after_kg)}</td>
                  <td className="r"><b>{fmtNum(d.loss_kg)}</b><div className="muted">{pct(Number(d.weight_before_kg) ? (Number(d.loss_kg) / Number(d.weight_before_kg)) * 100 : 0)}</div></td>
                  <td className="r">{Number(d.moisture_before) ? `${fmt(d.moisture_before, 1)}% → ${fmt(d.moisture_after, 1)}%` : '—'}</td>
                  <td><RowActions
                    onEdit={canEdit ? () => { setEditingId(d.id); setForm({ date: d.date, variety: d.variety, lot_ref: d.lot_ref || '', method: d.method, weight_before_kg: String(d.weight_before_kg), weight_after_kg: String(d.weight_after_kg), moisture_before: Number(d.moisture_before) ? String(d.moisture_before) : '', moisture_after: Number(d.moisture_after) ? String(d.moisture_after) : '', notes: d.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                    onDelete={canDel ? () => del(d) : null} /></td>
                </tr>
              )) : <Empty colSpan={8} text={T("Is muddat mein koi sukhai nahi.")} />}
            </tbody>
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
