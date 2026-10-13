import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useSettings } from '../context/DataContext';
import { fmt, fmtNum, rs, pct, kgToMaund, r2 } from '../lib/calc';
import { fmtDate } from '../lib/dates';
import { exportCSV } from '../lib/csv';
import { printTable } from '../lib/print';
import { Panel, DateRangeBar, Field, StatCard, Loading, Badge, SyncNote } from '../components/ui';
import { BarChart, LineChart, HBarChart, fmtShort, bucketLabel, PALETTE } from '../components/charts';
import { T } from '../lib/i18n';

const WATCH_ALL = ['purchases', 'sales', 'production_batches', 'expenses', 'labor_entries', 'machinery_log', 'transport_entries',
  'payments', 'cash_entries', 'zakat_assessments', 'weighments'];

export default function Analytics() {
  const range = useDateRange('analytics', 'season');
  const [bucket, setBucket] = useState('auto');
  const { settings } = useSettings();
  const a = useRpc('get_analytics', { p_from: range.from, p_to: range.to, p_bucket: bucket }, { watch: WATCH_ALL });
  const aging = useRpc('get_aging', { p_as_of: null }, { watch: ['ledger_entries'] });
  const [agingSide, setAgingSide] = useState('receivable');

  const d = a.data;
  const labels = useMemo(() => (d ? d.series.map((p) => bucketLabel(p.b, d.bucket)) : []), [d]);
  const col = (k, f = (x) => x) => (d ? d.series.map((p) => f(Number(p[k]) || 0)) : []);

  const agingRows = useMemo(() => (aging.data || []).filter((r) => r.side === agingSide), [aging.data, agingSide]);
  const agingTotals = useMemo(() => {
    const t = { balance: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    agingRows.forEach((r) => Object.keys(t).forEach((k) => { t[k] += Number(r[k]) || 0; }));
    return t;
  }, [agingRows]);

  if (a.loading && !d) return <Loading />;
  if (!d) return <Panel title={T("Stats / Analytics")}><div className="auth-error">{T("Data load nahi ho saka. ")}{a.error ? a.error.message : ''}</div></Panel>;

  const k = d.kpi;
  const purchaseMd = kgToMaund(k.purchase_kg);
  const avgRate = purchaseMd ? k.purchase_value / purchaseMd : 0;
  const recovery = k.milled_kg ? (k.rice_kg / k.milled_kg) * 100 : 0;
  const headRice = k.milled_kg ? (k.full_rice_kg / k.milled_kg) * 100 : 0;
  const margin = r2(k.sale_value - k.purchase_payable - k.expenses);
  const period = `${fmtDate(d.from)} — ${fmtDate(d.to)}`;

  const recoverySeries = d.series.map((p) => (Number(p.milled_kg) > 0 ? (Number(p.rice_kg) / Number(p.milled_kg)) * 100 : null));
  const headSeries = d.series.map((p) => (Number(p.milled_kg) > 0 ? (Number(p.full_rice_kg) / Number(p.milled_kg)) * 100 : null));
  const rateLabels = labels;
  const rateSeries = d.rates.map((r, i) => {
    const m = new Map(r.points.map((pt) => [String(pt.b), Number(pt.rate)]));
    return { name: r.variety, color: PALETTE[i % PALETTE.length], values: d.series.map((p) => (m.has(String(p.b)) ? m.get(String(p.b)) : null)) };
  });

  function printAging() {
    printTable({
      title: agingSide === 'receivable' ? T("Wasooli ki umar (Receivables ageing)") : T("Adaigi ki umar (Payables ageing)"),
      subtitle: fmtDate(new Date().toISOString().slice(0, 10)),
      columns: [{ label: T("Party") }, { label: T("Type") }, { label: T("Kul baqaya"), right: true }, { label: T("0-30 din"), right: true },
        { label: '31-60', right: true }, { label: '61-90', right: true }, { label: T("90+ din"), right: true }, { label: T("Sab se purana") }],
      rows: agingRows.map((r) => [r.party_name, r.party_type, rs(r.balance), rs(r.d0_30), rs(r.d31_60), rs(r.d61_90), rs(r.d90_plus), fmtDate(r.oldest)]),
      totals: [T("Total"), '', rs(agingTotals.balance), rs(agingTotals.d0_30), rs(agingTotals.d31_60), rs(agingTotals.d61_90), rs(agingTotals.d90_plus), ''],
    }, settings);
  }

  return (
    <>
      <Panel
        title={T("Stats / Analytics")}
        action={<>
          <SyncNote lastSynced={a.lastSynced} offline={a.offline} error={a.error} />
          <button type="button" className="btn small" onClick={() => window.print()}>{T("Print")}</button>
        </>}
      >
        <DateRangeBar range={range}>
          <Field label={T("Graph ka hissa")}>
            <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
              <option value="auto">{T("Khud (auto)")}</option><option value="day">{T("Rozana")}</option><option value="week">{T("Hafta-war")}</option><option value="month">{T("Mahana")}</option>
            </select>
          </Field>
        </DateRangeBar>
        <div className="note">{T("Muddat: ")}{period}{d.bucket ? `${T(" · graph: ")}${d.bucket === 'day' ? T("rozana") : d.bucket === 'week' ? T("hafta-war") : T("mahana")}` : ''}</div>
        <div className="cardgrid">
          <StatCard n={`${fmt(purchaseMd, 0)}${T(" md")}`} l={`${T("Paddy kharid (")}${fmt(k.purchase_count)}${T(" entries) · ")}${rs(k.purchase_payable)}`} />
          <StatCard n={rs(avgRate)} l={T("Ausat paddy rate (fi maund)")} />
          <StatCard n={`${fmt(kgToMaund(k.milled_kg), 0)}${T(" md")}`} l={T("Paddy milled")} />
          <StatCard n={pct(recovery)} l={`${T("Recovery · head rice ")}${pct(headRice)}`} good />
          <StatCard n={rs(k.sale_value)} l={`${T("Sale (tax ke baghair) · ")}${fmt(kgToMaund(k.sale_kg), 0)}${T(" md")}`} />
          <StatCard n={rs(k.expenses)} l={T("Kharche (mazdoori, rozana, machine, transport)")} />
          <StatCard n={rs(margin)} l={T("Sale − kharid − kharche (stock ke baghair)")} warn={margin < 0} good={margin > 0} />
          <StatCard n={rs(k.cash_in - k.cash_out)} l={`${T("Cash/Bank: aamad ")}${fmtShort(k.cash_in)}${T(" · kharch ")}${fmtShort(k.cash_out)}`} warn={k.cash_in - k.cash_out < 0} />
        </div>
      </Panel>

      <div className="chart-grid">
        <Panel title={T("Kharid vs Sale (Rs)")}>
          <BarChart labels={labels} series={[
            { name: T("Kharid (kul raqam)"), values: col('purchase_payable'), color: PALETTE[1] },
            { name: T("Sale (tax ke baghair)"), values: col('sale_value'), color: PALETTE[0] },
          ]} />
        </Panel>
        <Panel title={T("Paddy aamad vs Milling (maund)")}>
          <BarChart labels={labels} format={(v) => fmtShort(v)} series={[
            { name: T("Paddy aamad"), values: col('purchase_kg', kgToMaund), color: PALETTE[4] },
            { name: T("Milled"), values: col('milled_kg', kgToMaund), color: PALETTE[2] },
          ]} />
        </Panel>
        <Panel title={T("Recovery % trend")}>
          <LineChart labels={labels} format={(v) => `${Number(v).toFixed(0)}%`} series={[
            { name: T("Recovery (chawal + toota)"), values: recoverySeries, color: PALETTE[2] },
            { name: T("Head rice"), values: headSeries, color: PALETTE[1] },
          ]} />
        </Panel>
        <Panel title={T("Paddy rate (Rs / maund) — variety-wise")}>
          <LineChart labels={rateLabels} series={rateSeries} minZero={false} format={(v) => fmt(v, 0)} />
        </Panel>
        <Panel title={T("Cash / Bank — aamad vs kharch")}>
          <BarChart labels={labels} series={[
            { name: T("Aamad"), values: col('cash_in'), color: PALETTE[2] },
            { name: T("Kharch"), values: col('cash_out'), color: PALETTE[3] },
          ]} />
        </Panel>
        <Panel title={T("Kharche — category-wise")}>
          <HBarChart items={d.expenses_by_category.map((x) => ({ label: x.name, value: Number(x.value) }))} color={PALETTE[3]} empty={T("Is muddat mein kharche nahi.")} />
        </Panel>
        <Panel title={T("Variety mix (paddy kharid)")}>
          <HBarChart items={d.variety_mix.map((x) => ({ label: x.name, value: kgToMaund(x.kg), sub: x.rate ? `${rs(x.rate)}/md` : '' }))} format={(v) => `${fmt(v, 0)} md`} color={PALETTE[4]} empty={T("Is muddat mein kharid nahi.")} />
        </Panel>
        <Panel title={T("Sale — item-wise")}>
          <HBarChart items={d.sales_by_item.map((x) => ({ label: x.name, value: Number(x.value), sub: x.per_kg ? `${rs(x.per_kg)}/kg` : '' }))} color={PALETTE[0]} empty={T("Is muddat mein sale nahi.")} />
        </Panel>
        <Panel title={T("Top 10 suppliers (Kisan / Arhti)")}>
          <HBarChart items={d.top_suppliers.map((x) => ({ label: x.name, value: Number(x.value), sub: `${x.type} · ${fmt(kgToMaund(x.kg), 0)} md` }))} color={PALETTE[1]} empty={T("Koi kharid nahi.")} />
        </Panel>
        <Panel title={T("Top 10 customers")}>
          <HBarChart items={d.top_customers.map((x) => ({ label: x.name, value: Number(x.value), sub: `${fmt(kgToMaund(x.kg), 0)} md` }))} color={PALETTE[0]} empty={T("Koi sale nahi.")} />
        </Panel>
      </div>

      <Panel title={T("Recovery — variety-wise")}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Variety")}</th><th className="r">{T("Paddy (kg)")}</th><th className="r">{T("Chawal + toota (kg)")}</th><th className="r">{T("Recovery")}</th><th className="r">{T("Head rice")}</th></tr></thead>
            <tbody>
              {d.recovery_by_variety.length ? d.recovery_by_variety.map((x) => (
                <tr key={x.name}><td>{x.name}</td><td className="r">{fmtNum(x.input)}</td><td className="r">{fmtNum(x.rice)}</td>
                  <td className="r"><b>{pct(x.pct)}</b></td><td className="r">{pct(Number(x.input) ? (Number(x.full_rice) / Number(x.input)) * 100 : 0)}</td></tr>
              )) : <tr><td colSpan={5} className="empty">{T("Is muddat mein production nahi.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={T("Udhaar ki umar (Ageing) — aaj tak")}
        action={<>
          <button type="button" className="btn small" onClick={printAging}>{T("Print")}</button>
          <button type="button" className="btn small" onClick={() => exportCSV(`ageing_${agingSide}.csv`, ['Party', 'Type', 'Balance', '0-30', '31-60', '61-90', '90+', 'Oldest'],
            agingRows.map((r) => [r.party_name, r.party_type, r.balance, r.d0_30, r.d31_60, r.d61_90, r.d90_plus, r.oldest]))}>{T("CSV")}</button>
        </>}
      >
        <div className="filterbar">
          <Field label={T("Dikhayein")}>
            <select value={agingSide} onChange={(e) => setAgingSide(e.target.value)}>
              <option value="receivable">{T("Lena hai (Receivables)")}</option>
              <option value="payable">{T("Dena hai (Payables)")}</option>
            </select>
          </Field>
        </div>
        <div className="cardgrid">
          <StatCard n={rs(agingTotals.balance)} l={agingSide === 'receivable' ? T("Kul lena") : T("Kul dena")} />
          <StatCard n={rs(agingTotals.d0_30)} l={T("0 – 30 din")} />
          <StatCard n={rs(agingTotals.d31_60)} l={T("31 – 60 din")} />
          <StatCard n={rs(agingTotals.d61_90)} l={T("61 – 90 din")} warn={agingTotals.d61_90 > 0} />
          <StatCard n={rs(agingTotals.d90_plus)} l={T("90 din se purana")} warn={agingTotals.d90_plus > 0} />
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Party")}</th><th className="r">{T("Kul")}</th><th className="r">0-30</th><th className="r">31-60</th><th className="r">61-90</th><th className="r">90+</th><th>{T("Sab se purana")}</th></tr></thead>
            <tbody>
              {agingRows.length ? agingRows.slice(0, 200).map((r) => (
                <tr key={r.party_type + r.party_name}>
                  <td><Link to={`/statement?type=${encodeURIComponent(r.party_type)}&name=${encodeURIComponent(r.party_name)}`}>{r.party_name}</Link> <Badge>{r.party_type}</Badge></td>
                  <td className="r"><b>{rs(r.balance)}</b></td><td className="r">{rs(r.d0_30)}</td><td className="r">{rs(r.d31_60)}</td>
                  <td className="r">{Number(r.d61_90) ? <span className="neg-text">{rs(r.d61_90)}</span> : rs(0)}</td>
                  <td className="r">{Number(r.d90_plus) ? <b className="neg-text">{rs(r.d90_plus)}</b> : rs(0)}</td>
                  <td>{fmtDate(r.oldest)}</td>
                </tr>
              )) : <tr><td colSpan={7} className="empty">{T("Koi baqaya nahi.")}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="note">{T("Umar FIFO se: pehle aayi raqam pehle wasool/ada maani jati hai, baqaya sab se taaza entries ka hota hai.")}</div>
      </Panel>
    </>
  );
}
