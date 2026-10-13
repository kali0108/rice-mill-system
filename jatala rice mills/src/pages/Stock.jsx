import { useMemo, useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useSettings, useCatalog } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { num, fmt, fmtNum, kgToMaund, sum } from '../lib/calc';
import { todayStr, fmtDate, daysBetween, addDays } from '../lib/dates';
import { STOCK_ADJ_REASONS, CATEGORY_LABELS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printTable } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, VarietySelect, ProductSelect, DateRangeBar, Empty, PendingTag, Badge, FormActions, RowActions, confirmDelete, SyncNote, useShowMore,
} from '../components/ui';
import { T } from '../lib/i18n';

const blankAdj = () => ({ date: todayStr(), item: 'Paddy', variety: '', direction: 'In', qty_kg: '', reason: 'Opening Stock', notes: '' });
const blankLot = () => ({ godown: '', lot_no: '', item: 'Rice - Full Grain', variety: '', bags: '', weight_per_bag_kg: '50', date_in: todayStr(), last_fumigation: '', status: 'In Stock', notes: '' });

export default function Stock() {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const writable = can(profile, 'stock', 'add');
  const canEdit = can(profile, 'stock', 'edit');
  const canDel = can(profile, 'stock', 'delete');
  const { hasVariety } = useCatalog();
  const summary = useRpc('get_stock_summary', {}, { watch: WATCH.stock });
  const adjRange = useDateRange('stock-adj', 'month');
  const adjustments = useSupaTable('stock_adjustments', { from: adjRange.from, to: adjRange.to });
  const [lotStatus, setLotStatus] = useState('In Stock');
  const lots = useSupaTable('stock_lots', { orderBy: 'date_in', eq: lotStatus === 'all' ? undefined : { status: lotStatus } });
  const t = todayStr();
  const fumDays = Number(settings.fumigation_days) || 30;
  const ageDays = Number(settings.ageing_days) || 60;

  const [adj, setAdj] = useState(blankAdj);
  const [adjEditing, setAdjEditing] = useState(null);
  const [lot, setLot] = useState(blankLot);
  const [lotEditing, setLotEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const setA = (k) => (e) => setAdj((f) => ({ ...f, [k]: e.target.value }));
  const setL = (k) => (e) => setLot((f) => ({ ...f, [k]: e.target.value }));

  const lines = useMemo(() => summary.data || [], [summary.data]);
  const [lotsVisible, lotsMore] = useShowMore(lots.rows, 100);

  async function saveAdj(e) {
    e.preventDefault();
    if (saving) return;
    if (num(adj.qty_kg) <= 0) return toast.error(T("Quantity (kg) likhein."));
    const payload = { date: adj.date, item: adj.item, variety: hasVariety(adj.item) ? adj.variety.trim() : '', direction: adj.direction, qty_kg: num(adj.qty_kg), reason: adj.reason, notes: adj.notes.trim() };
    setSaving(true);
    const res = adjEditing ? await adjustments.update(adjEditing, payload) : await adjustments.insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(T("Stock adjustment save ho gaya."));
    setAdjEditing(null);
    setAdj(blankAdj());
  }

  async function saveLot(e) {
    e.preventDefault();
    if (saving) return;
    if (!lot.godown.trim() || !lot.lot_no.trim()) return toast.error(T("Godown aur Lot # likhein."));
    const payload = {
      godown: lot.godown.trim(), lot_no: lot.lot_no.trim(), item: lot.item, variety: lot.variety.trim(), bags: Math.round(num(lot.bags)),
      weight_per_bag_kg: num(lot.weight_per_bag_kg), total_weight_kg: Math.round(num(lot.bags)) * num(lot.weight_per_bag_kg),
      date_in: lot.date_in, last_fumigation: lot.last_fumigation || null, status: lot.status, notes: lot.notes.trim(),
    };
    setSaving(true);
    const res = lotEditing ? await lots.update(lotEditing, payload) : await lots.insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(T("Godown lot save ho gaya."));
    setLotEditing(null);
    setLot(blankLot());
  }

  async function quickLot(l, changes, msg) {
    const res = await lots.update(l.id, changes);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(msg);
  }

  async function delAdj(a) {
    if (!confirmDelete(`${a.item} ${fmtNum(a.qty_kg)} kg`)) return;
    const res = await adjustments.remove(a.id);
    if (res.error) toast.error(friendlyError(res.error));
  }
  async function delLot(l) {
    if (!confirmDelete(`${l.godown} / ${l.lot_no}`)) return;
    const res = await lots.remove(l.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <Panel
        title={T("Stock Summary (khud hisaab — aaj tak)")}
        action={<>
          <SyncNote lastSynced={summary.lastSynced} offline={summary.offline} error={summary.error} />
          <button type="button" className="btn small" onClick={() => printTable({
            title: T("Stock Summary"), subtitle: fmtDate(t),
            columns: [{ label: T("Item") }, { label: T("Variety") }, { label: T("Aamad kg"), right: true }, { label: T("Nikasi kg"), right: true }, { label: T("Baqi kg"), right: true }, { label: T("Maund"), right: true }],
            rows: lines.map((s) => [s.item, s.variety || '—', fmtNum(s.qty_in), fmtNum(s.qty_out), fmtNum(s.balance_kg), fmt(kgToMaund(s.balance_kg), 2)]),
          }, settings)}>{T("Print")}</button>
          <button type="button" className="btn small" onClick={() => exportCSV('stock_summary.csv', ['Item', 'Variety', 'InKg', 'OutKg', 'BalanceKg', 'Maund'],
            lines.map((s) => [s.item, s.variety, s.qty_in, s.qty_out, s.balance_kg, kgToMaund(s.balance_kg).toFixed(2)]))}>{T("CSV")}</button>
        </>}
      >
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Item")}</th><th>{T("Variety")}</th><th className="r">{T("Aamad (kg)")}</th><th className="r">{T("Nikasi (kg)")}</th><th className="r">{T("Baqi (kg)")}</th><th className="r">{T("Maund")}</th></tr></thead>
            <tbody>
              {summary.loading && !lines.length ? <Empty colSpan={6} text={T("Loading…")} /> : lines.length ? lines.map((s) => {
                const bal = Number(s.balance_kg);
                return (
                  <tr key={s.item + '|' + s.variety} className={bal < -0.01 ? 'warnrow' : ''}>
                    <td>{s.item}<div className="muted">{CATEGORY_LABELS[s.category] || ''}</div></td>
                    <td>{s.variety || (!hasVariety(s.item) ? '—' : <span className="muted">{T("Variety nahi likhi")}</span>)}</td>
                    <td className="r">{fmtNum(s.qty_in)}</td><td className="r">{fmtNum(s.qty_out)}</td>
                    <td className="r"><b>{fmtNum(bal)}</b> {bal < -0.01 && <Badge kind="bounced">{T("Manfi")}</Badge>}</td>
                    <td className="r">{fmt(kgToMaund(bal), 2)}</td>
                  </tr>
                );
              }) : <Empty colSpan={6} text={T("Abhi koi stock nahi.")} />}
            </tbody>
          </table>
        </div>
        <div className="note">{T("Aamad: kharid (paddy), production output, stock adjustment (In). Nikasi: production mein lagi paddy, sales, adjustment (Out). Manfi (negative) stock ka matlab hai koi entry reh gayi hai — e.g. opening stock ya variety ghalat. Pehli dafa app chala rahe hain to neeche \"Opening Stock\" adjustment daal dein.")}</div>
      </Panel>

      {(writable || (adjEditing && canEdit)) && (
        <Panel title={adjEditing ? T("Stock Adjustment Edit") : T("Stock Adjustment (Opening, kami/izafa, boiler mein husk, apna istemal…)")}>
          <form onSubmit={saveAdj}>
            <div className="form-grid">
              <Field label={T("Tareekh")}><input type="date" value={adj.date} onChange={setA('date')} required /></Field>
              <Field label={T("Item (maal)")}><ProductSelect value={adj.item} onChange={setA('item')} required /></Field>
              {hasVariety(adj.item) && <Field label={T("Variety")}><VarietySelect value={adj.variety} onChange={setA('variety')} /></Field>}
              <Field label={T("Aamad / Nikasi")}>
                <select value={adj.direction} onChange={setA('direction')}><option value="In">{T("Aamad (+ stock)")}</option><option value="Out">{T("Nikasi (− stock)")}</option></select>
              </Field>
              <Field label={T("Quantity (kg)")}><NumInput value={adj.qty_kg} onChange={setA('qty_kg')} required /></Field>
              <Field label={T("Wajah")}><select value={adj.reason} onChange={setA('reason')}>{STOCK_ADJ_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
              <Field label={T("Note")} wide><input value={adj.notes} onChange={setA('notes')} /></Field>
            </div>
            <FormActions saving={saving} editing={!!adjEditing} onCancel={() => { setAdjEditing(null); setAdj(blankAdj()); }} saveLabel={T("Adjustment Save")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Stock Adjustments")}>
        <DateRangeBar range={adjRange} />
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Date")}</th><th>{T("Item")}</th><th>{T("Variety")}</th><th>{T("Wajah")}</th><th className="r">{T("Aamad")}</th><th className="r">{T("Nikasi")}</th><th></th></tr></thead>
            <tbody>
              {adjustments.rows.length ? adjustments.rows.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDate(a.date)} {a._pending && <PendingTag />}</td><td>{a.item}</td><td>{a.variety || '—'}</td>
                  <td>{a.reason}{a.notes ? <div className="muted">{a.notes}</div> : null}</td>
                  <td className="r">{a.direction === 'In' ? fmtNum(a.qty_kg) : ''}</td><td className="r">{a.direction === 'Out' ? fmtNum(a.qty_kg) : ''}</td>
                  <td>
                    <RowActions
                      onEdit={canEdit ? () => { setAdjEditing(a.id); setAdj({ date: a.date, item: a.item, variety: a.variety || '', direction: a.direction, qty_kg: String(a.qty_kg), reason: a.reason, notes: a.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                      onDelete={canDel ? () => delAdj(a) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={7} text={T("Is muddat mein koi adjustment nahi.")} />}
            </tbody>
          </table>
        </div>
      </Panel>

      {(writable || (lotEditing && canEdit)) && (
        <Panel title={lotEditing ? T("Godown Lot Edit") : T("Godown Lot (kahan rakha hai + fumigation)")}>
          <form onSubmit={saveLot}>
            <div className="form-grid">
              <Field label={T("Godown")}><input value={lot.godown} onChange={setL('godown')} required placeholder={T("e.g. Godown 1")} /></Field>
              <Field label={T("Lot #")}><input value={lot.lot_no} onChange={setL('lot_no')} required /></Field>
              <Field label={T("Item (maal)")}><ProductSelect value={lot.item} onChange={setL('item')} required /></Field>
              {hasVariety(lot.item) && <Field label={T("Variety")}><VarietySelect value={lot.variety} onChange={setL('variety')} /></Field>}
              <Field label={T("Bags")}><NumInput step="1" value={lot.bags} onChange={setL('bags')} required /></Field>
              <Field label={T("Wazan fi bag (kg)")}><NumInput value={lot.weight_per_bag_kg} onChange={setL('weight_per_bag_kg')} required /></Field>
              <Field label={T("Aamad ki tareekh")}><input type="date" value={lot.date_in} onChange={setL('date_in')} required /></Field>
              <Field label={T("Aakhri fumigation")}><input type="date" value={lot.last_fumigation} onChange={setL('last_fumigation')} /></Field>
              <Field label={T("Status")}><select value={lot.status} onChange={setL('status')}><option value="In Stock">{T("In Stock")}</option><option value="Empty">{T("Khali (Empty)")}</option></select></Field>
              <Field label={T("Note")}><input value={lot.notes} onChange={setL('notes')} /></Field>
            </div>
            <div className="calcline">{T("Kul wazan: ")}<b>{fmtNum(num(lot.bags) * num(lot.weight_per_bag_kg))}{T(" kg")}</b></div>
            <FormActions saving={saving} editing={!!lotEditing} onCancel={() => { setLotEditing(null); setLot(blankLot()); }} saveLabel={T("Lot Save")} />
          </form>
        </Panel>
      )}

      <Panel title={T("Godown Lots")} action={<SyncNote lastSynced={lots.lastSynced} offline={lots.offline} error={lots.error} />}>
        <div className="filterbar">
          <Field label={T("Dikhayein")}>
            <select value={lotStatus} onChange={(e) => setLotStatus(e.target.value)}>
              <option value="In Stock">{T("Sirf In Stock")}</option><option value="Empty">{T("Khali lots")}</option><option value="all">{T("Sab")}</option>
            </select>
          </Field>
        </div>
        <div className="mini-stats"><span>{lots.rows.length}{T(" lots")}</span><span>{fmt(sum(lots.rows, 'bags'))}{T(" bags")}</span><span>{fmtNum(sum(lots.rows, 'total_weight_kg'))}{T(" kg")}</span></div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Godown / Lot")}</th><th>{T("Item")}</th><th className="r">{T("Bags")}</th><th className="r">{T("Wazan")}</th><th>{T("Aamad")}</th><th>{T("Umar")}</th><th>{T("Fumigation")}</th><th></th></tr></thead>
            <tbody>
              {lots.loading && !lots.rows.length ? <Empty colSpan={8} text={T("Loading…")} /> : lotsVisible.length ? lotsVisible.map((l) => {
                const age = daysBetween(l.date_in, t);
                let fum;
                if (l.status === 'Empty') fum = <Badge>—</Badge>;
                else if (!l.last_fumigation) fum = <Badge kind="pos">{T("Darj nahi")}</Badge>;
                else {
                  const d = daysBetween(t, addDays(l.last_fumigation, fumDays));
                  fum = d < 0 ? <Badge kind="bounced">{T("Overdue ")}{Math.abs(d)}{T(" din")}</Badge> : d <= 7 ? <Badge kind="pending">{d}{T(" din mein")}</Badge> : <Badge kind="neg">{T("Theek")}</Badge>;
                }
                return (
                  <tr key={l.id} className={l.status === 'Empty' ? 'dim' : ''}>
                    <td>{l.godown} / <b>{l.lot_no}</b> {l._pending && <PendingTag />}</td>
                    <td>{l.item}{l.variety ? <div className="muted">{l.variety}</div> : null}</td>
                    <td className="r">{fmt(l.bags)}</td><td className="r">{fmtNum(l.total_weight_kg)}{T(" kg")}</td>
                    <td>{fmtDate(l.date_in)}</td>
                    <td>{Number.isNaN(age) ? '—' : <Badge kind={age > ageDays ? 'pos' : 'zero'}>{age}{T(" din")}</Badge>}</td>
                    <td>{fum}{l.last_fumigation ? <div className="muted">{fmtDate(l.last_fumigation)}</div> : null}</td>
                    <td>
                      <RowActions
                        extra={canEdit && l.status !== 'Empty' ? <>
                          <button type="button" className="btn small" onClick={() => quickLot(l, { last_fumigation: t }, 'Aaj ki fumigation darj ho gayi.')}>{T("Fumigation aaj")}</button>
                          <button type="button" className="btn small" onClick={() => quickLot(l, { status: 'Empty' }, 'Lot khali mark ho gaya.')}>{T("Khali")}</button>
                        </> : null}
                        onEdit={canEdit ? () => { setLotEditing(l.id); setLot({ godown: l.godown, lot_no: l.lot_no, item: l.item, variety: l.variety || '', bags: String(l.bags), weight_per_bag_kg: String(l.weight_per_bag_kg), date_in: l.date_in, last_fumigation: l.last_fumigation || '', status: l.status || 'In Stock', notes: l.notes || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); } : null}
                        onDelete={canDel ? () => delLot(l) : null}
                      />
                    </td>
                  </tr>
                );
              }) : <Empty colSpan={8} text={T("Koi lot nahi.")} />}
            </tbody>
          </table>
        </div>
        {lotsMore}
        <div className="note">{T("Fumigation har ")}{fumDays}{T(" din aur purane stock ki warning ")}{ageDays}{T(" din par — yeh Owner \"Mill Settings\" mein badal sakta hai.")}</div>
      </Panel>
    </>
  );
}
