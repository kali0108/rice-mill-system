import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useSettings, useCatalog } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { canWrite } from '../lib/roles';
import { productionCalc, outputLines, num, fmt, fmtNum, pct, sum, kgToMaund } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { PROCESSES, PRODUCT_CATEGORIES } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printTable } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, VarietySelect, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions, RowActions,
  Empty, PendingTag, StatCard, confirmDelete, SyncNote,
} from '../components/ui';

const OUTPUT_CATEGORIES = ['rice', 'broken', 'byproduct', 'other'];

const blank = (prev) => ({
  date: prev?.date || todayStr(), lot_no: '', process: prev?.process || 'Raw', variety: prev?.variety || '',
  paddy_input_kg: '', outputs: {}, wastage_kg: '', notes: '',
});

function toForm(b) {
  const outputs = {};
  outputLines(b).forEach((l) => { outputs[l.product] = String(l.qty_kg); });
  return {
    date: b.date, lot_no: b.lot_no, process: b.process || 'Raw', variety: b.variety || '',
    paddy_input_kg: Number(b.paddy_input_kg) ? String(b.paddy_input_kg) : '', outputs,
    wastage_kg: Number(b.wastage_kg) ? String(b.wastage_kg) : '', notes: b.notes || '',
  };
}

function outputsPayload(map) {
  return Object.entries(map).map(([product, q]) => ({ product, qty_kg: num(q) })).filter((o) => o.qty_kg > 0);
}

export default function Production() {
  const range = useDateRange('production', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error } = useSupaTable('production_batches', { from: range.from, to: range.to });
  const stock = useRpc('get_stock_summary', {}, { watch: WATCH.stock });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { activeProducts, categoryOf } = useCatalog();
  const toast = useToast();
  const writable = canWrite(profile, 'production');
  const canManageProducts = canWrite(profile, 'products');

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setOut = (product) => (e) => setForm((f) => ({ ...f, outputs: { ...f.outputs, [product]: e.target.value } }));

  // Every active non-paddy product is an output line, grouped by category
  const outputGroups = useMemo(() => {
    const groupOf = (n) => (OUTPUT_CATEGORIES.includes(categoryOf(n)) ? categoryOf(n) : 'other');
    const names = new Set(activeProducts.filter((p) => p.category !== 'paddy').map((p) => p.name));
    Object.keys(form.outputs).forEach((n) => names.add(n)); // keep products of an old batch being edited
    return OUTPUT_CATEGORIES.map((cat) => ({
      cat,
      label: PRODUCT_CATEGORIES.find((c) => c.value === cat)?.label || cat,
      names: [...names].filter((n) => categoryOf(n) !== 'paddy' && groupOf(n) === cat),
    })).filter((g) => g.names.length);
  }, [activeProducts, form.outputs, categoryOf]);

  const draft = { paddy_input_kg: form.paddy_input_kg, wastage_kg: form.wastage_kg, outputs: outputsPayload(form.outputs) };
  const c = productionCalc(draft, categoryOf);

  const paddyStock = useMemo(() => {
    const line = (stock.data || []).find((s) => s.item === 'Paddy' && s.variety === form.variety.trim());
    return line ? Number(line.balance_kg) : null;
  }, [stock.data, form.variety]);

  const filtered = useMemo(() => rows.filter((b) => matchesSearch(q, b.lot_no, b.variety, b.process, b.notes, ...outputLines(b).map((l) => l.product))), [rows, q]);
  const [visible, more] = useShowMore(filtered);
  const calcOf = (b) => productionCalc(b, categoryOf);
  const totIn = sum(filtered, 'paddy_input_kg');
  const totRice = sum(filtered, (b) => calcOf(b).totalRice);
  const totFull = sum(filtered, (b) => calcOf(b).fullGrain);

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.lot_no.trim()) return toast.error('Lot number likhein.');
    if (!form.variety) return toast.error('Paddy ki variety chunein.');
    if (c.input <= 0) return toast.error('Paddy input (kg) likhein.');
    if (!draft.outputs.length) return toast.error('Kam az kam ek output (chawal, kanki waghaira) likhein.');
    if (c.totalRice > c.input) return toast.error('Chawal ka output paddy input se zyada nahi ho sakta.');
    if (c.unaccounted < -0.5 && !window.confirm(`Kul output (${fmtNum(c.accounted)} kg) paddy input (${fmtNum(c.input)} kg) se zyada hai. Phir bhi save karein?`)) return;
    if (!editingId && paddyStock != null && c.input > paddyStock + 0.01 && !window.confirm(`Stock mein "${form.variety}" paddy sirf ${fmtNum(paddyStock)} kg hai. Phir bhi save karein?`)) return;
    const payload = {
      date: form.date, lot_no: form.lot_no.trim(), process: form.process, variety: form.variety,
      paddy_input_kg: num(form.paddy_input_kg), outputs: draft.outputs, wastage_kg: num(form.wastage_kg),
      recovery_pct: Math.round(c.recoveryPct * 100) / 100, notes: form.notes.trim(),
    };
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error('Save nahi hua: ' + friendlyError(res.error));
    toast.success(res.queued ? 'Offline save — sync baad mein hogi.' : 'Production batch save ho gaya (stock update).');
    setEditingId(null);
    setForm(blank(form));
  }

  async function del(b) {
    if (!confirmDelete(`Lot ${b.lot_no}`)) return;
    const res = await remove(b.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success('Batch delete ho gaya.');
  }

  const outputsText = (b) => outputLines(b).map((l) => `${l.product} ${fmtNum(l.qty_kg)}`).join(' · ');

  return (
    <>
      <div className="cardgrid">
        <StatCard n={`${fmtNum(totIn)} kg`} l={`Paddy milled (${fmt(kgToMaund(totIn), 1)} maund)`} />
        <StatCard n={`${fmtNum(totRice)} kg`} l="Kul chawal (full grain + toota)" />
        <StatCard n={pct(totIn ? (totRice / totIn) * 100 : 0)} l="Recovery % (is muddat)" good />
        <StatCard n={pct(totIn ? (totFull / totIn) * 100 : 0)} l="Head rice (sirf full grain) %" />
      </div>

      {writable && (
        <Panel title={editingId ? 'Production Batch Edit Karein' : 'Naya Production Batch (Milling)'}>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="Tareekh"><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label="Lot #"><input value={form.lot_no} onChange={set('lot_no')} required placeholder="e.g. LOT-104" /></Field>
              <Field label="Process">
                <select value={form.process} onChange={set('process')}>{PROCESSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
              </Field>
              <Field label="Paddy variety"><VarietySelect value={form.variety} onChange={set('variety')} required /></Field>
              <Field label="Paddy input (kg)" hint={paddyStock != null ? `Stock mein: ${fmtNum(paddyStock)} kg` : null}><NumInput value={form.paddy_input_kg} onChange={set('paddy_input_kg')} required /></Field>
            </div>

            {outputGroups.map((g) => (
              <div key={g.cat} className="output-group">
                <div className="output-title">{g.label}</div>
                <div className="form-grid">
                  {g.names.map((n) => (
                    <Field key={n} label={`${n} (kg)`}><NumInput value={form.outputs[n] || ''} onChange={setOut(n)} /></Field>
                  ))}
                </div>
              </div>
            ))}
            <div className="form-grid">
              <Field label="Wastage / loss (kg)"><NumInput value={form.wastage_kg} onChange={set('wastage_kg')} /></Field>
              <Field label="Note" wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            {canManageProducts && <div className="note">Naya maal (jaise B1 Tota, Rice Polish)? <Link to="/products">Products &amp; Varieties</Link> mein add karein — yahan khud aa jayega.</div>}

            <div className="calcline">
              Kul chawal: <b>{fmtNum(c.totalRice)} kg</b> (full grain {fmtNum(c.fullGrain)} + toota {fmtNum(c.broken)}) · Recovery: <b>{pct(c.recoveryPct)}</b> · Head rice: <b>{pct(c.fullGrainPct)}</b>
              {' · '}By-products: <b>{fmtNum(c.byproducts + c.other)} kg</b>
              {c.input > 0 && <> · Hisaab se bahar: <b className={Math.abs(c.unaccounted) > c.input * 0.03 ? 'neg-text' : ''}>{fmtNum(c.unaccounted)} kg</b></>}
            </div>
            <FormActions saving={saving} editing={!!editingId} onCancel={() => { setEditingId(null); setForm(blank()); }} saveLabel="Batch Save Karein" />
          </form>
        </Panel>
      )}

      <Panel
        title="Production Register"
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={error} />
          <button type="button" className="btn small" onClick={() => printTable({
            title: 'Production Register', subtitle: `${range.from ? fmtDate(range.from) : 'Shuru'} — ${range.to ? fmtDate(range.to) : 'Aaj'}`,
            columns: [{ label: 'Date' }, { label: 'Lot' }, { label: 'Process' }, { label: 'Variety' }, { label: 'Paddy kg', right: true },
              { label: 'Full grain', right: true }, { label: 'Toota', right: true }, { label: 'By-products', right: true }, { label: 'Recovery', right: true }],
            rows: filtered.map((b) => { const x = calcOf(b); return [fmtDate(b.date), b.lot_no, b.process, b.variety || '—', fmtNum(b.paddy_input_kg), fmtNum(x.fullGrain), fmtNum(x.broken), fmtNum(x.byproducts + x.other), pct(x.recoveryPct)]; }),
            totals: ['Total', '', '', '', fmtNum(totIn), fmtNum(totFull), fmtNum(totRice - totFull), '', pct(totIn ? (totRice / totIn) * 100 : 0)],
          }, settings)}>Print</button>
          <button type="button" className="btn small" onClick={() => exportCSV('production.csv', ['Date', 'Lot', 'Process', 'Variety', 'PaddyIn', 'FullGrain', 'Broken', 'ByProducts', 'Wastage', 'Recovery%', 'Outputs', 'Notes'],
            filtered.map((b) => { const x = calcOf(b); return [b.date, b.lot_no, b.process, b.variety, b.paddy_input_kg, x.fullGrain, x.broken, x.byproducts + x.other, b.wastage_kg, x.recoveryPct.toFixed(2), outputsText(b), b.notes]; }))}>Export CSV</button>
        </>}
      >
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder="Lot, variety, product…" /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Date</th><th>Lot</th><th>Variety / Process</th><th className="r">Paddy in</th><th className="r">Full grain</th><th className="r">Toota</th><th className="r">By-products</th><th className="r">Recovery</th><th></th></tr></thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={9} text="Loading…" /> : visible.length ? visible.map((b) => {
                const x = calcOf(b);
                return (
                  <tr key={b.id}>
                    <td>{fmtDate(b.date)} {b._pending && <PendingTag />}</td>
                    <td>{b.lot_no}</td>
                    <td className="wrap">{b.variety || <span className="muted">—</span>} · {b.process}<div className="muted">{outputsText(b)}</div></td>
                    <td className="r">{fmtNum(b.paddy_input_kg)}</td>
                    <td className="r">{fmtNum(x.fullGrain)}</td>
                    <td className="r">{fmtNum(x.broken)}</td>
                    <td className="r">{fmtNum(x.byproducts + x.other)}</td>
                    <td className="r"><b>{pct(x.recoveryPct)}</b></td>
                    <td><RowActions onEdit={writable ? () => { setEditingId(b.id); setForm(toForm(b)); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null} onDelete={writable ? () => del(b) : null} /></td>
                  </tr>
                );
              }) : <Empty colSpan={9} text="Is muddat mein koi batch nahi." />}
            </tbody>
          </table>
        </div>
        {more}
        <div className="note">Recovery % = (Full grain + Toota/Kanki) ÷ Paddy input × 100. Kaunsa product kis qisam mein gina jaye, yeh &quot;Products &amp; Varieties&quot; mein set hota hai. Save karte hi paddy ka stock kam aur output ka stock barh jata hai.</div>
      </Panel>
    </>
  );
}
