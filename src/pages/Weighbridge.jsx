import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { num, fmt, fmtNum, rs, kgToMaund, sum } from '../lib/calc';
import { todayStr, fmtDate, fmtDateTime } from '../lib/dates';
import { WEIGH_KINDS } from '../lib/constants';
import { exportCSV } from '../lib/csv';
import { printWeighment } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, DateRangeBar, SearchBox, matchesSearch, useShowMore, FormActions, RowActions, Empty, PendingTag,
  Badge, StatCard, confirmDelete, SyncNote,
} from '../components/ui';
import { T } from '../lib/i18n';

const blank = (prev) => ({ kind: prev?.kind || 'Purchase', vehicle_no: '', party_name: '', item: prev?.item || 'Paddy', first_wt: '', fee: '', notes: '' });

export default function Weighbridge() {
  const range = useDateRange('weighbridge', 'today');
  const done = useSupaTable('weighments', { from: range.from, to: range.to });
  const open = useSupaTable('weighments', { eq: { status: 'Open' } });
  const linked = useSupaTable('purchases', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const writable = can(profile, 'weighbridge', 'add');
  const canEdit = can(profile, 'weighbridge', 'edit');
  const canDel = can(profile, 'weighbridge', 'delete');
  const canBuy = can(profile, 'purchase', 'add');

  const [form, setForm] = useState(() => blank());
  const [saving, setSaving] = useState(false);
  const [second, setSecond] = useState({});
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const linkedIds = useMemo(() => new Set(linked.rows.map((p) => p.weighment_id).filter(Boolean)), [linked.rows]);
  const finished = useMemo(() => done.rows.filter((w) => w.status === 'Done' && matchesSearch(q, w.slip_no, w.vehicle_no, w.party_name, w.item, w.kind)), [done.rows, q]);
  const [visible, more] = useShowMore(finished);

  async function saveFirst(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.vehicle_no.trim()) return toast.error(T("Gaari number likhein."));
    if (num(form.first_wt) <= 0) return toast.error(T("Pehla wazan likhein."));
    setSaving(true);
    const res = await open.insert({
      date: todayStr(), kind: form.kind, vehicle_no: form.vehicle_no.trim().toUpperCase(), party_name: form.party_name.trim(),
      item: form.item.trim(), first_wt: num(form.first_wt), first_at: new Date().toISOString(), fee: num(form.fee), notes: form.notes.trim(),
    });
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    toast.success(`${T("Pehla wazan save — ")}${res.data?.slip_no || ''}${T(" gaari andar.")}`);
    setForm(blank(form));
  }

  async function saveSecond(w) {
    const v = num(second[w.id]);
    if (v <= 0) return toast.error(T("Doosra wazan likhein."));
    const res = await open.update(w.id, { second_wt: v, second_at: new Date().toISOString() });
    if (res.error) return toast.error(friendlyError(res.error));
    setSecond((s) => ({ ...s, [w.id]: '' }));
    toast.success(`${T("Net wazan ")}${fmtNum(Math.abs(Number(w.first_wt) - v))}${T(" kg — slip tayyar.")}`);
    if (res.data) printWeighment(res.data, settings);
  }

  async function del(w) {
    if (linkedIds.has(w.id)) return toast.error(T("Is slip se kharid ban chuki hai — pehle kharid hatayein."));
    if (!confirmDelete(`${w.slip_no} ${w.vehicle_no}`)) return;
    const res = await open.remove(w.id);
    if (res.error) toast.error(friendlyError(res.error));
  }

  return (
    <>
      <div className="cardgrid">
        <StatCard n={open.rows.length} l={T("Gaariyan andar (doosra wazan baqi)")} warn={open.rows.length > 0} />
        <StatCard n={`${fmt(kgToMaund(sum(finished, 'net_wt')), 0)}${T(" md")}`} l={`${T("Is muddat ka net wazan (")}${finished.length}${T(" slips)")}`} />
        <StatCard n={rs(sum(finished, 'fee'))} l={T("Kanta fee (Rokar mein aamad)")} />
      </div>

      {writable && (
        <Panel title={T("Gaari andar — pehla wazan")}>
          <form onSubmit={saveFirst}>
            <div className="form-grid">
              <Field label={T("Qisam")}><select value={form.kind} onChange={set('kind')}>{WEIGH_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></Field>
              <Field label={T("Gaari #")}><input value={form.vehicle_no} onChange={set('vehicle_no')} required placeholder={T("e.g. GAA-1234")} autoFocus /></Field>
              <Field label={T("Party / Driver")}><input value={form.party_name} onChange={set('party_name')} /></Field>
              <Field label={T("Maal")}><input value={form.item} onChange={set('item')} /></Field>
              <Field label={T("Pehla wazan (kg)")}><NumInput value={form.first_wt} onChange={set('first_wt')} required /></Field>
              {form.kind === 'Public' && <Field label={T("Kanta fee (Rs)")}><NumInput value={form.fee} onChange={set('fee')} /></Field>}
              <Field label={T("Note")} wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>
            <FormActions saving={saving} saveLabel={T("Pehla Wazan Save")} />
          </form>
        </Panel>
      )}

      <Panel title={`${T("Andar wali gaariyan (")}${open.rows.length})`} action={<SyncNote lastSynced={open.lastSynced} offline={open.offline} error={open.error} />}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Slip")}</th><th>{T("Gaari")}</th><th>{T("Party / Maal")}</th><th className="r">{T("Pehla wazan")}</th><th>{T("Andar aayi")}</th><th>{T("Doosra wazan (kg)")}</th><th></th></tr></thead>
            <tbody>
              {open.rows.length ? open.rows.map((w) => (
                <tr key={w.id}>
                  <td>{w.slip_no || '—'} {w._pending && <PendingTag />}<div className="muted">{w.kind}</div></td>
                  <td><b>{w.vehicle_no}</b></td>
                  <td>{w.party_name || '—'}<div className="muted">{w.item}</div></td>
                  <td className="r">{fmtNum(w.first_wt)}</td>
                  <td>{fmtDateTime(w.first_at)}</td>
                  <td>
                    {canEdit ? (
                      <div className="inline-2" style={{ minWidth: 220 }}>
                        <NumInput value={second[w.id] || ''} onChange={(e) => setSecond((s) => ({ ...s, [w.id]: e.target.value }))} aria-label={`${T("Doosra wazan ")}${w.vehicle_no}`} />
                        <button type="button" className="btn small primary" onClick={() => saveSecond(w)}>{T("Save + Slip")}</button>
                      </div>
                    ) : '—'}
                  </td>
                  <td><RowActions onDelete={canDel ? () => del(w) : null} /></td>
                </tr>
              )) : <Empty colSpan={7} text={T("Koi gaari andar nahi.")} />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={T("Kanta Register")}
        action={<button type="button" className="btn small" onClick={() => exportCSV('weighbridge.csv', ['Slip', 'Date', 'Kind', 'Vehicle', 'Party', 'Item', 'First', 'Second', 'Net', 'Fee'],
          finished.map((w) => [w.slip_no, w.date, w.kind, w.vehicle_no, w.party_name, w.item, w.first_wt, w.second_wt, w.net_wt, w.fee]))}>{T("Export CSV")}</button>}
      >
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder={T("Slip, gaari, party…")} /></DateRangeBar>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Slip")}</th><th>{T("Gaari")}</th><th>{T("Party / Maal")}</th><th className="r">{T("Pehla")}</th><th className="r">{T("Doosra")}</th><th className="r">{T("Net")}</th><th className="r">{T("Fee")}</th><th></th></tr></thead>
            <tbody>
              {done.loading && !done.rows.length ? <Empty colSpan={8} text={T("Loading…")} /> : visible.length ? visible.map((w) => (
                <tr key={w.id}>
                  <td>{w.slip_no}<div className="muted">{fmtDate(w.date)} · {w.kind}</div></td>
                  <td><b>{w.vehicle_no}</b></td>
                  <td>{w.party_name || '—'}<div className="muted">{w.item}</div></td>
                  <td className="r">{fmtNum(w.first_wt)}</td>
                  <td className="r">{fmtNum(w.second_wt)}</td>
                  <td className="r"><b>{fmtNum(w.net_wt)}</b><div className="muted">{fmt(kgToMaund(w.net_wt), 2)}{T(" md")}</div></td>
                  <td className="r">{Number(w.fee) ? rs(w.fee) : '—'}</td>
                  <td>
                    <RowActions
                      onPrint={() => printWeighment(w, settings)}
                      onDelete={canDel ? () => del(w) : null}
                      extra={w.kind === 'Purchase' ? (linkedIds.has(w.id)
                        ? <Badge kind="cleared">{T("Kharid ban gayi")}</Badge>
                        : canBuy ? <button type="button" className="btn small gold" onClick={() => navigate(`/purchase?weighment=${w.id}`)}>{T("Kharid banayein")}</button> : null) : null}
                    />
                  </td>
                </tr>
              )) : <Empty colSpan={8} text={T("Is muddat mein koi slip nahi.")} />}
            </tbody>
          </table>
        </div>
        {more}
        <div className="note">{T("Paddy wali gaari: pehla wazan (bhari) → khali hone ke baad doosra wazan → \"Kharid banayein\" se kharid form mein gross/tare/gaari khud bhar jaate hain.")}</div>
      </Panel>
    </>
  );
}
