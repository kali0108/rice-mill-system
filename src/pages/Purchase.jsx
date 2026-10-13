import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useDateRange } from '../hooks/useDateRange';
import { useAuth } from '../context/AuthContext';
import { useParties, useSettings } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { can } from '../lib/roles';
import { purchaseCalc, deductionKg, moistureRule, num, fmt, fmtNum, rs, kgToMaund, sum } from '../lib/calc';
import { todayStr, fmtDate } from '../lib/dates';
import { exportCSV } from '../lib/csv';
import { printPurchaseSlip, printTable } from '../lib/print';
import { friendlyError } from '../lib/errors';
import {
  Panel, Field, NumInput, PartyInput, VarietySelect, BalanceHint, DateRangeBar, SearchBox, matchesSearch, useShowMore,
  FormActions, RowActions, Empty, PendingTag, SyncNote, confirmDelete, Badge,
} from '../components/ui';
import { T } from '../lib/i18n';

function blank(prev) {
  return {
    date: prev?.date || todayStr(), slip_no: '', mode: prev?.mode || 'Direct', khata_of: 'Arhti',
    farmer_name: '', arhti_name: prev?.mode === 'Arhti' ? prev.arhti_name : '', variety: prev?.variety || 'Super Basmati',
    vehicle_no: '', bags: '', gross_wt: '', tare_wt: '', bag_wt_kg: prev?.bag_wt_kg || '',
    katoti_method: prev?.katoti_method || 'kg', katoti_value: prev?.katoti_method && prev.katoti_method !== 'kg' ? prev.katoti_value : '',
    moisture_pct: '', broken_pct: '', fm_pct: '', rate_per_maund: prev?.rate_per_maund || '',
    commission_pct: prev?.mode === 'Arhti' ? prev.commission_pct : '', labor_charges: '', advance_applied: '', notes: '',
    contract_id: '', weighment_id: '',
  };
}

function toForm(p) {
  const s = (v) => (v == null || Number(v) === 0 ? '' : String(v));
  return {
    date: p.date, slip_no: p.slip_no || '', mode: p.mode || 'Direct', khata_of: p.khata_of === 'Kisan' ? 'Kisan' : 'Arhti',
    farmer_name: p.farmer_name || '', arhti_name: p.arhti_name || '', variety: p.variety || '', vehicle_no: p.vehicle_no || '',
    bags: s(p.bags), gross_wt: s(p.gross_wt), tare_wt: s(p.tare_wt), bag_wt_kg: s(p.bag_wt_kg),
    katoti_method: 'kg', katoti_value: s(p.deduction_kg), moisture_pct: s(p.moisture_pct), broken_pct: s(p.broken_pct),
    fm_pct: s(p.fm_pct), rate_per_maund: s(p.rate_per_maund), commission_pct: s(p.commission_pct),
    labor_charges: s(p.labor_charges), advance_applied: s(p.advance_applied), notes: p.notes || '',
    contract_id: p.contract_id || '', weighment_id: p.weighment_id || '',
  };
}

function buildPayload(f, canonicalName) {
  const arhti = f.mode === 'Arhti';
  const base = { bags: Math.round(num(f.bags)), gross_wt: num(f.gross_wt), tare_wt: num(f.tare_wt), bag_wt_kg: num(f.bag_wt_kg) };
  const afterBardana = base.gross_wt - base.tare_wt - base.bags * base.bag_wt_kg;
  const p = {
    date: f.date,
    slip_no: f.slip_no.trim(),
    mode: f.mode,
    khata_of: arhti ? f.khata_of : 'Kisan',
    farmer_name: canonicalName('Kisan', f.farmer_name),
    arhti_name: arhti ? canonicalName('Arhti', f.arhti_name) : '',
    variety: f.variety.trim(),
    vehicle_no: f.vehicle_no.trim().toUpperCase(),
    ...base,
    deduction_kg: deductionKg(f.katoti_method, f.katoti_value, afterBardana),
    moisture_pct: num(f.moisture_pct), broken_pct: num(f.broken_pct), fm_pct: num(f.fm_pct),
    rate_per_maund: num(f.rate_per_maund),
    commission_pct: arhti ? num(f.commission_pct) : 0,
    labor_charges: num(f.labor_charges),
    advance_applied: num(f.advance_applied),
    notes: f.notes.trim(),
    contract_id: f.contract_id || null,
    weighment_id: f.weighment_id || null,
  };
  const c = purchaseCalc(p);
  return { ...p, net_wt: c.netWt, amount: c.amount, commission_amount: c.commission, total_payable: c.total, net_payable: c.netPayable };
}

function khataParty(p) {
  return p.mode === 'Arhti' && p.khata_of !== 'Kisan' ? { type: 'Arhti', name: p.arhti_name } : { type: 'Kisan', name: p.farmer_name };
}

export default function Purchase() {
  const range = useDateRange('purchase', 'month');
  const { rows, insert, update, remove, loading, lastSynced, offline, error: loadError } = useSupaTable('purchases', { from: range.from, to: range.to });
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { canonicalName } = useParties();
  const toast = useToast();
  const writable = can(profile, 'purchase', 'add');
  const canEdit = can(profile, 'purchase', 'edit');
  const canDel = can(profile, 'purchase', 'delete');
  const contracts = useSupaTable('contracts', { eq: { kind: 'purchase', status: 'Open' }, orderBy: 'date' });
  const [params, setParams] = useSearchParams();
  const weighmentId = params.get('weighment');
  const weighment = useSupaTable('weighments', { eq: { id: weighmentId || '00000000-0000-0000-0000-000000000000' }, orderBy: 'date' });

  const [form, setForm] = useState(() => blank());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const preview = useMemo(() => buildPayload(form, (t, n) => n.trim()), [form]);
  const calc = purchaseCalc(preview);
  const party = khataParty(form);
  const rule = moistureRule(form.moisture_pct, settings.moisture_base_pct, settings.moisture_kg_per_point);
  const ruleApplied = rule && form.katoti_method === 'per_maund' && num(form.katoti_value) === rule.kgPerMaund;

  // Opened from the Kanta page: fill gross / tare / vehicle from the slip
  const slip = weighmentId ? weighment.rows[0] : null;
  useEffect(() => {
    if (!slip || slip.status !== 'Done') return;
    const hi = Math.max(Number(slip.first_wt), Number(slip.second_wt));
    const lo = Math.min(Number(slip.first_wt), Number(slip.second_wt));
    setEditingId(null);
    setForm((f) => ({ ...blank(f), date: slip.date, vehicle_no: slip.vehicle_no, gross_wt: String(hi), tare_wt: String(lo), farmer_name: slip.party_name || '', weighment_id: slip.id }));
    setParams({}, { replace: true });
    toast.info(`${T("Kanta slip ")}${slip.slip_no}${T(" se wazan bhar diya — baqi khane bharein.")}`);
  }, [slip, setParams, toast]);

  const partyContracts = useMemo(() => {
    const k = String(party.name || '').trim().toLowerCase();
    return contracts.rows.filter((ct) => ct.party_type === party.type && (!k || ct.party_name.toLowerCase() === k));
  }, [contracts.rows, party.type, party.name]);

  function pickContract(id) {
    const ct = contracts.rows.find((x) => x.id === id);
    if (!ct) { setForm((f) => ({ ...f, contract_id: '' })); return; }
    const perMaund = ct.rate_unit === 'maund' ? Number(ct.rate) : ct.rate_unit === 'kg' ? Number(ct.rate) * 40 : Number(ct.rate) / 25;
    setForm((f) => ({
      ...f, contract_id: id, variety: ct.variety || f.variety, rate_per_maund: String(Math.round(perMaund * 100) / 100),
      ...(ct.party_type === 'Arhti' ? { mode: 'Arhti', arhti_name: ct.party_name, khata_of: 'Arhti' } : { farmer_name: ct.party_name }),
    }));
  }

  const filtered = useMemo(
    () => rows.filter((p) => matchesSearch(q, p.slip_no, p.farmer_name, p.arhti_name, p.variety, p.vehicle_no, p.notes)),
    [rows, q]
  );
  const [visible, more] = useShowMore(filtered);

  function startEdit(p) {
    setEditingId(p.id);
    setForm(toForm(p));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() {
    setEditingId(null);
    setForm(blank());
  }

  async function save(andPrint) {
    if (saving) return;
    const f = form;
    if (!f.date) return toast.error(T("Tareekh zaroori hai."));
    if (f.mode === 'Arhti' && !f.arhti_name.trim()) return toast.error(T("Arhti ka naam likhein."));
    if ((f.mode === 'Direct' || f.khata_of === 'Kisan') && !f.farmer_name.trim()) return toast.error(T("Kisan ka naam likhein."));
    if (!f.variety.trim()) return toast.error(T("Variety likhein."));
    if (num(f.gross_wt) <= 0) return toast.error(T("Gross weight likhein."));
    if (calc.netWt <= 0) return toast.error(T("Net weight zero ya manfi aa raha hai — Gross, Tare aur katoti check karein."));
    if (num(f.rate_per_maund) <= 0 && !window.confirm(T("Rate 0 hai. Kya rate baad mein lagana hai? (Khata mein abhi 0 jama hoga)"))) return;
    if (num(f.advance_applied) > calc.total && !window.confirm(T("Mauqa par adaigi kul raqam se zyada hai. Phir bhi save karein?"))) return;

    const payload = buildPayload(f, canonicalName);
    setSaving(true);
    const res = editingId ? await update(editingId, payload) : await insert(payload);
    setSaving(false);
    if (res.error) return toast.error(T("Save nahi hua: ") + friendlyError(res.error));
    toast.success(res.queued ? T("Offline save ho gayi — internet aane par sync hogi.") : editingId ? T("Kharid update ho gayi.") : `${T("Kharid save ho gayi")}${res.data?.slip_no ? ' — ' + res.data.slip_no : ''}.`);
    if (andPrint) printPurchaseSlip(res.data || { ...payload, id: editingId }, settings);
    setEditingId(null);
    setForm(blank(editingId ? null : f));
  }

  async function del(p) {
    if (!confirmDelete(`${p.slip_no || ''} ${p.farmer_name || p.arhti_name}`)) return;
    const res = await remove(p.id);
    if (res.error) toast.error(friendlyError(res.error));
    else toast.success(T("Kharid delete ho gayi (khata entry bhi hat gayi)."));
  }

  // Aamad ka khulasa: variety-wise maund, ausat rate aur ausat moisture
  const byVariety = useMemo(() => {
    const m = new Map();
    filtered.forEach((p) => {
      const v = m.get(p.variety) || { variety: p.variety, n: 0, kg: 0, amount: 0, moistKg: 0, moistW: 0 };
      v.n += 1;
      v.kg += Number(p.net_wt) || 0;
      v.amount += Number(p.amount) || 0;
      if (Number(p.moisture_pct)) { v.moistKg += Number(p.moisture_pct) * (Number(p.net_wt) || 0); v.moistW += Number(p.net_wt) || 0; }
      m.set(p.variety, v);
    });
    return [...m.values()].sort((a, b) => b.kg - a.kg);
  }, [filtered]);

  const totals = {
    bags: sum(filtered, 'bags'),
    kg: sum(filtered, 'net_wt'),
    total: sum(filtered, 'total_payable'),
    paid: sum(filtered, 'advance_applied'),
    balance: sum(filtered, 'net_payable'),
  };

  function exportRows() {
    exportCSV(`purchases_${range.from || 'all'}_${range.to || ''}.csv`,
      ['Date', 'Slip', 'Mode', 'Khata', 'Kisan', 'Arhti', 'Variety', 'Vehicle', 'Bags', 'Gross', 'Tare', 'BardanaKg/Bag', 'KatotiKg', 'NetKg', 'Maund',
        'Moisture%', 'Broken%', 'FM%', 'Rate/Maund', 'Amount', 'Commission%', 'Commission', 'Mazdoori', 'Total', 'CashPaid', 'Balance', 'Notes'],
      filtered.map((p) => [p.date, p.slip_no, p.mode, p.khata_of, p.farmer_name, p.arhti_name, p.variety, p.vehicle_no, p.bags, p.gross_wt, p.tare_wt,
        p.bag_wt_kg, p.deduction_kg, p.net_wt, kgToMaund(p.net_wt).toFixed(2), p.moisture_pct, p.broken_pct, p.fm_pct, p.rate_per_maund, p.amount,
        p.commission_pct, p.commission_amount, p.labor_charges, p.total_payable, p.advance_applied, p.net_payable, p.notes]));
  }

  function printRegister() {
    printTable({
      title: T("Kharid Register"),
      subtitle: `${range.from ? fmtDate(range.from) : T("Shuru")} — ${range.to ? fmtDate(range.to) : T("Aaj")}`,
      columns: [{ label: T("Date") }, { label: T("Slip") }, { label: T("Party") }, { label: T("Variety") }, { label: T("Bags"), right: true },
        { label: T("Net kg"), right: true }, { label: T("Maund"), right: true }, { label: T("Rate"), right: true }, { label: T("Total"), right: true },
        { label: T("Adaigi"), right: true }, { label: T("Baqaya"), right: true }],
      rows: filtered.map((p) => [fmtDate(p.date), p.slip_no, khataParty(p).name, p.variety, fmt(p.bags), fmtNum(p.net_wt),
        fmt(kgToMaund(p.net_wt), 2), rs(p.rate_per_maund), rs(p.total_payable), rs(p.advance_applied), rs(p.net_payable)]),
      totals: [T("Total"), '', '', '', fmt(totals.bags), fmtNum(totals.kg), fmt(kgToMaund(totals.kg), 2), '', rs(totals.total), rs(totals.paid), rs(totals.balance)],
    }, settings);
  }

  return (
    <>
      {(writable || (editingId && canEdit)) && (
        <Panel title={editingId ? T("Kharid Entry Edit Karein") : T("Nayi Kharid (Kanta Parchi)")}>
          <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
            <div className="form-grid">
              <Field label={T("Tareekh")}><input type="date" value={form.date} onChange={set('date')} required /></Field>
              <Field label={T("Slip # (khali = auto)")}><input value={form.slip_no} onChange={set('slip_no')} placeholder={T("Auto")} /></Field>
              <Field label={T("Kharid ka tareeqa")}>
                <select value={form.mode} onChange={set('mode')}>
                  <option value="Direct">{T("Direct Kisan se")}</option>
                  <option value="Arhti">{T("Arhti / Beopari ke zariye")}</option>
                </select>
              </Field>
              {form.mode === 'Arhti' && (
                <Field label={T("Arhti ka naam")}><PartyInput type="Arhti" value={form.arhti_name} onChange={set('arhti_name')} required /></Field>
              )}
              <Field label={form.mode === 'Arhti' ? T("Kisan ka naam (optional)") : T("Kisan ka naam")}>
                <PartyInput type="Kisan" value={form.farmer_name} onChange={set('farmer_name')} required={form.mode === 'Direct' || form.khata_of === 'Kisan'} />
              </Field>
              {form.mode === 'Arhti' && (
                <Field label={T("Khata kis ke naam?")}>
                  <select value={form.khata_of} onChange={set('khata_of')}>
                    <option value="Arhti">{T("Arhti (Arhti ko payment)")}</option>
                    <option value="Kisan">{T("Kisan (Kisan ko seedha payment)")}</option>
                  </select>
                </Field>
              )}
              <Field label={T("Sauda (contract)")} hint={partyContracts.length ? T("Chunein to rate/variety khud bhar jayenge") : T("Is party ka koi open sauda nahi")}>
                <select value={form.contract_id} onChange={(e) => pickContract(e.target.value)}>
                  <option value="">{T("— Baghair saude ke —")}</option>
                  {partyContracts.map((ct) => <option key={ct.id} value={ct.id}>{ct.contract_no} · {ct.party_name} · {ct.variety || T("Paddy")}</option>)}
                </select>
              </Field>
              <Field label={T("Variety")}><VarietySelect value={form.variety} onChange={set('variety')} required /></Field>
              <Field label={T("Gaari / Trolley #")}><input value={form.vehicle_no} onChange={set('vehicle_no')} placeholder={T("e.g. GAA-1234")} /></Field>
              <Field label={T("Bags (Bardana)")}><NumInput step="1" value={form.bags} onChange={set('bags')} /></Field>
              <Field label={T("Gross weight (kg)")}><NumInput value={form.gross_wt} onChange={set('gross_wt')} required /></Field>
              <Field label={T("Tare / khali gaari (kg)")}><NumInput value={form.tare_wt} onChange={set('tare_wt')} /></Field>
              <Field label={T("Bardana katoti per bag (kg)")} hint={T("e.g. 0.5 – 1 kg")}><NumInput value={form.bag_wt_kg} onChange={set('bag_wt_kg')} /></Field>
              <Field label={T("Namee / quality katoti")} hint={T("Kul kg, kg fi maund, ya % wazan")}>
                <div className="inline-2">
                  <select value={form.katoti_method} onChange={set('katoti_method')} aria-label={T("Katoti ka tareeqa")}>
                    <option value="kg">{T("kg")}</option>
                    <option value="per_maund">{T("kg/md")}</option>
                    <option value="percent">%</option>
                  </select>
                  <NumInput value={form.katoti_value} onChange={set('katoti_value')} placeholder="0" />
                </div>
              </Field>
              <Field label={T("Moisture %")}><NumInput value={form.moisture_pct} onChange={set('moisture_pct')} /></Field>
              <Field label={T("Broken %")}><NumInput value={form.broken_pct} onChange={set('broken_pct')} /></Field>
              <Field label={T("Foreign matter %")}><NumInput value={form.fm_pct} onChange={set('fm_pct')} /></Field>
              <Field label={T("Rate (Rs per 40 kg maund)")}><NumInput value={form.rate_per_maund} onChange={set('rate_per_maund')} required /></Field>
              {form.mode === 'Arhti' && (
                <Field label={T("Arhti commission %")}><NumInput value={form.commission_pct} onChange={set('commission_pct')} /></Field>
              )}
              <Field label={T("Mazdoori katoti (Rs)")} hint={T("Seller se kati jaane wali")}><NumInput value={form.labor_charges} onChange={set('labor_charges')} /></Field>
              <Field label={T("Mauqa par cash adaigi (Rs)")} hint={T("Abhi diye gaye paise")}><NumInput value={form.advance_applied} onChange={set('advance_applied')} /></Field>
              <Field label={T("Note")} wide><input value={form.notes} onChange={set('notes')} /></Field>
            </div>

            {rule && (
              <div className={`balance-hint ${ruleApplied ? 'neg' : 'pos'}`}>{T("Namee rule: moisture ")}{fmt(form.moisture_pct, 1)}% − {fmt(settings.moisture_base_pct, 1)}% = {fmt(rule.points, 1)} × {fmt(settings.moisture_kg_per_point, 2)}{T(" kg = ")}<b>{fmt(rule.kgPerMaund, 2)}{T(" kg fi maund")}</b>{T(" katoti.")}{' '}
                {ruleApplied ? T("Lag gayi.") : (
                  <button type="button" className="linkbtn" onClick={() => setForm((f) => ({ ...f, katoti_method: 'per_maund', katoti_value: String(rule.kgPerMaund) }))}>{T("Rule lagayein")}</button>
                )}
              </div>
            )}
            <div className="calcline">{T("Net: ")}<b>{fmtNum(calc.netWt)}{T(" kg")}</b> = <b>{fmt(calc.maunds, 2)}{T(" maund")}</b>
              {calc.bagDeduction ? <>{T(" (bardana −")}{fmtNum(calc.bagDeduction)}{T(" kg)")}</> : null}
              {preview.deduction_kg ? <>{T(" (katoti −")}{fmtNum(preview.deduction_kg)}{T(" kg)")}</> : null}
              {' · '}{T("Raqam: ")}<b>{rs(calc.amount)}</b>
              {calc.commission ? <>{T(" · Commission: ")}<b>{rs(calc.commission)}</b></> : null}
              {num(form.labor_charges) ? <>{T(" · Mazdoori: −")}{rs(form.labor_charges)}</> : null}
              {' · '}{T("Kul (khata mein jama): ")}<b>{rs(calc.total)}</b>
              {num(form.advance_applied) ? <>{T(" · Adaigi: −")}{rs(form.advance_applied)}</> : null}
              {' · '}{T("Baqaya: ")}<b>{rs(calc.netPayable)}</b>
            </div>
            {form.weighment_id ? <div className="note">{T("Kanta slip se judi hui kharid.")}</div> : null}
            <BalanceHint type={party.type} name={party.name} />
            <div className="note">{T("Peshgi (advance) jo pehle ")}<b>{T("Payments")}</b>{T(" mein darj ho chuki hai woh khata mein pehle se kat chuki hai — usay yahan \"mauqa par adaigi\" mein dobara na likhein.")}</div>
            <FormActions
              saving={saving}
              editing={!!editingId}
              onCancel={cancelEdit}
              saveLabel={T("Kharid Save Karein")}
              extra={<button type="button" className="btn gold" disabled={saving} onClick={() => save(true)}>{T("Save + Slip Print")}</button>}
            />
          </form>
        </Panel>
      )}

      <Panel
        title={T("Kharid Register")}
        action={<>
          <SyncNote lastSynced={lastSynced} offline={offline} error={loadError} />
          <button type="button" className="btn small" onClick={printRegister}>{T("Print")}</button>
          <button type="button" className="btn small" onClick={exportRows}>{T("Export CSV")}</button>
        </>}
      >
        <DateRangeBar range={range}><SearchBox value={q} onChange={setQ} placeholder={T("Slip, naam, variety, gaari…")} /></DateRangeBar>
        {byVariety.length > 1 || (byVariety.length === 1 && filtered.length > 1) ? (
          <div className="tablewrap" style={{ marginBottom: 10 }}>
            <table className="data compact">
              <thead><tr><th>{T("Variety (aamad ka khulasa)")}</th><th className="r">{T("Entries")}</th><th className="r">{T("Maund")}</th><th className="r">{T("Ausat rate / md")}</th><th className="r">{T("Ausat moisture")}</th></tr></thead>
              <tbody>
                {byVariety.map((v) => (
                  <tr key={v.variety}>
                    <td>{v.variety}</td><td className="r">{v.n}</td><td className="r">{fmt(kgToMaund(v.kg), 2)}</td>
                    <td className="r">{rs(v.kg ? v.amount / kgToMaund(v.kg) : 0)}</td>
                    <td className="r">{v.moistW ? `${fmt(v.moistKg / v.moistW, 1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mini-stats">
          <span>{filtered.length}{T(" entries")}</span>
          <span>{fmt(totals.bags)}{T(" bags")}</span>
          <span>{fmtNum(totals.kg)}{T(" kg (")}{fmt(kgToMaund(totals.kg), 2)}{T(" maund)")}</span>
          <span>{T("Kul ")}{rs(totals.total)}</span>
          <span>{T("Baqaya ")}{rs(totals.balance)}</span>
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>{T("Date")}</th><th>{T("Slip")}</th><th>{T("Party (khata)")}</th><th>{T("Variety")}</th><th className="r">{T("Bags")}</th><th className="r">{T("Net kg")}</th>
                <th className="r">{T("Maund")}</th><th className="r">{T("Rate")}</th><th className="r">{T("Kul")}</th><th className="r">{T("Adaigi")}</th><th className="r">{T("Baqaya")}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loading && !rows.length ? <Empty colSpan={12} text={T("Loading…")} /> : visible.length ? visible.map((p) => {
                const kp = khataParty(p);
                return (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)} {p._pending && <PendingTag />}</td>
                    <td>{p.slip_no || '—'}</td>
                    <td>
                      {kp.name} <Badge kind="zero">{kp.type}</Badge>
                      {p.mode === 'Arhti' && kp.type === 'Arhti' && p.farmer_name ? <div className="muted">{T("Kisan: ")}{p.farmer_name}</div> : null}
                    </td>
                    <td>{p.variety}</td>
                    <td className="r">{fmt(p.bags)}</td>
                    <td className="r">{fmtNum(p.net_wt)}</td>
                    <td className="r">{fmt(kgToMaund(p.net_wt), 2)}</td>
                    <td className="r">{rs(p.rate_per_maund)}</td>
                    <td className="r">{rs(p.total_payable ?? p.amount)}</td>
                    <td className="r">{rs(p.advance_applied)}</td>
                    <td className="r"><b>{rs(p.net_payable)}</b></td>
                    <td>
                      <RowActions
                        onPrint={() => printPurchaseSlip(p, settings)}
                        onEdit={canEdit ? () => startEdit(p) : null}
                        onDelete={canDel ? () => del(p) : null}
                      />
                    </td>
                  </tr>
                );
              }) : <Empty colSpan={12} text={T("Is muddat mein koi kharid nahi.")} />}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4}>{T("Total")}</td><td className="r">{fmt(totals.bags)}</td><td className="r">{fmtNum(totals.kg)}</td>
                  <td className="r">{fmt(kgToMaund(totals.kg), 2)}</td><td></td><td className="r">{rs(totals.total)}</td>
                  <td className="r">{rs(totals.paid)}</td><td className="r">{rs(totals.balance)}</td><td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {more}
      </Panel>
    </>
  );
}
