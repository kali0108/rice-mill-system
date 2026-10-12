import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc } from '../hooks/useRpc';
import { useDateRange } from '../hooks/useDateRange';
import { useParties, useSettings, useCatalog } from '../context/DataContext';
import { productionCalc, fmt, fmtNum, rs, pct, sum, kgToMaund, r2 } from '../lib/calc';
import { fmtDate, monthKey, monthLabel } from '../lib/dates';
import { printTable } from '../lib/print';
import { Panel, DateRangeBar, Empty, StatCard, Loading, Badge } from '../components/ui';

function groupBy(rows, keyFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return m;
}

export default function Reports() {
  const range = useDateRange('reports', 'month');
  const opt = { from: range.from, to: range.to };
  const purchases = useSupaTable('purchases', opt);
  const sales = useSupaTable('sales', opt);
  const production = useSupaTable('production_batches', opt);
  const labor = useSupaTable('labor_entries', opt);
  const expenses = useSupaTable('expenses', opt);
  const machinery = useSupaTable('machinery_log', opt);
  const transport = useSupaTable('transport_entries', opt);
  const { balances } = useParties();
  const { settings } = useSettings();
  const { categoryOf } = useCatalog();
  const period = `${range.from ? fmtDate(range.from) : 'Shuru'} — ${range.to ? fmtDate(range.to) : 'Aaj'}`;
  const costing = useRpc('get_costing', { p_from: range.from, p_to: range.to }, { watch: ['purchases', 'production_batches', 'drying_batches', 'labor_entries', 'expenses', 'machinery_log', 'transport_entries', 'sales'] });
  const loading = [purchases, sales, production, labor, expenses, machinery, transport].some((x) => x.loading && !x.rows.length);

  const r = useMemo(() => {
    const P = purchases.rows; const S = sales.rows; const B = production.rows; const L = labor.rows;
    const E = expenses.rows; const M = machinery.rows; const T = transport.rows;
    const revenue = sum(S, 'amount');
    const gst = sum(S, 'tax_amount');
    const paddyCost = sum(P, (p) => p.total_payable ?? p.amount);
    const laborCost = sum(L, 'gross');
    const expenseCost = sum(E, 'amount');
    const machineCost = sum(M, 'cost');
    const transportCost = sum(T, (t) => t.total_amount || (Number(t.freight_amount) + Number(t.commission_amount)));
    const totalCost = r2(paddyCost + laborCost + expenseCost + machineCost + transportCost);
    const net = r2(revenue - totalCost);

    const byVariety = [...groupBy(P, (p) => p.variety || '—').entries()].map(([k, rows]) => {
      const kg = sum(rows, 'net_wt');
      const amt = sum(rows, 'amount');
      return { k, n: rows.length, bags: sum(rows, 'bags'), kg, amt, avg: kg ? amt / kgToMaund(kg) : 0 };
    }).sort((a, b) => b.kg - a.kg);

    const byItem = [...groupBy(S, (s) => `${s.item}${s.variety ? ' — ' + s.variety : ''}`).entries()].map(([k, rows]) => {
      const kg = sum(rows, 'qty_kg');
      const amt = sum(rows, 'amount');
      return { k, n: rows.length, kg, amt, net: sum(rows, 'net_amount'), perKg: kg ? amt / kg : 0 };
    }).sort((a, b) => b.amt - a.amt);

    const byProcess = [...groupBy(B, (b) => `${b.process} — ${b.variety || 'variety nahi'}`).entries()].map(([k, rows]) => {
      const input = sum(rows, 'paddy_input_kg');
      const rice = sum(rows, (b) => productionCalc(b, categoryOf).totalRice);
      const full = sum(rows, (b) => productionCalc(b, categoryOf).fullGrain);
      return { k, n: rows.length, input, rice, full, rec: input ? (rice / input) * 100 : 0, head: input ? (full / input) * 100 : 0 };
    }).sort((a, b) => b.input - a.input);

    const byCategory = [...groupBy(E, (x) => x.category).entries()].map(([k, rows]) => ({ k, amt: sum(rows, 'amount') }))
      .concat(machineCost ? [{ k: 'Machine repair', amt: machineCost }] : [])
      .concat(laborCost ? [{ k: 'Mazdoori (labor)', amt: laborCost }] : [])
      .concat(transportCost ? [{ k: 'Transport / commission', amt: transportCost }] : [])
      .sort((a, b) => b.amt - a.amt);

    const months = new Map();
    const bump = (d, key, v) => {
      const mk = monthKey(d);
      if (!mk) return;
      const o = months.get(mk) || { purchase: 0, sale: 0, cost: 0, paddyKg: 0, milledKg: 0 };
      o[key] += Number(v) || 0;
      months.set(mk, o);
    };
    P.forEach((p) => { bump(p.date, 'purchase', p.total_payable ?? p.amount); bump(p.date, 'paddyKg', p.net_wt); });
    S.forEach((s) => bump(s.date, 'sale', s.amount));
    B.forEach((b) => bump(b.date, 'milledKg', b.paddy_input_kg));
    L.forEach((l) => bump(l.date, 'cost', l.gross));
    E.forEach((x) => bump(x.date, 'cost', x.amount));
    M.forEach((m) => bump(m.date, 'cost', m.cost));
    T.forEach((t) => bump(t.date, 'cost', t.total_amount || (Number(t.freight_amount) + Number(t.commission_amount))));
    const monthly = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const milled = sum(B, 'paddy_input_kg');
    const riceOut = sum(B, (b) => productionCalc(b, categoryOf).totalRice);
    return { revenue, gst, paddyCost, laborCost, expenseCost, machineCost, transportCost, totalCost, net, byVariety, byItem, byProcess, byCategory, monthly, milled, riceOut, paddyKg: sum(P, 'net_wt'), saleKg: sum(S, 'qty_kg') };
  }, [purchases.rows, sales.rows, production.rows, labor.rows, expenses.rows, machinery.rows, transport.rows, categoryOf]);

  const payables = balances.filter((b) => Number(b.balance) > 0.5).sort((a, b) => b.balance - a.balance).slice(0, 15);
  const receivables = balances.filter((b) => Number(b.balance) < -0.5).sort((a, b) => a.balance - b.balance).slice(0, 15);

  if (loading) return <Loading />;

  const printPL = () => printTable({
    title: 'Munafa / Nuqsan (P&L)', subtitle: period,
    columns: [{ label: 'Hisaab' }, { label: 'Rupay', right: true }],
    rows: [
      ['Sale (tax ke baghair)', rs(r.revenue)],
      ['− Paddy kharid (commission samet, mazdoori katoti nikaal kar)', rs(r.paddyCost)],
      ['− Mazdoori (gross)', rs(r.laborCost)],
      ['− Rozana kharche', rs(r.expenseCost)],
      ['− Machine repair', rs(r.machineCost)],
      ['− Transport / commission', rs(r.transportCost)],
    ],
    totals: ['Khalis munafa / nuqsan', rs(r.net)],
    notes: 'Is mein stock ki tabdeeli (opening/closing stock), depreciation aur kiraya shamil nahi. GST alag (sirkar ka) hai.',
  }, settings);

  return (
    <>
      <Panel title="Report ki muddat">
        <DateRangeBar range={range} />
        <div className="cardgrid">
          <StatCard n={rs(r.revenue)} l="Sale (tax ke baghair)" />
          <StatCard n={rs(r.paddyCost)} l={`Paddy kharid (${fmt(kgToMaund(r.paddyKg), 0)} maund)`} />
          <StatCard n={rs(r.laborCost + r.expenseCost + r.machineCost + r.transportCost)} l="Kharche (mazdoori, rozana, machine, transport)" />
          <StatCard n={rs(r.net)} l="Khalis munafa / nuqsan" warn={r.net < 0} good={r.net > 0} />
          <StatCard n={pct(r.milled ? (r.riceOut / r.milled) * 100 : 0)} l={`Recovery (${fmt(r.milled)} kg paddy milled)`} />
          <StatCard n={rs(r.gst)} l="GST wasool (sirkar ka)" />
        </div>
        <button type="button" className="btn small" onClick={printPL}>P&amp;L Print</button>
        <div className="note">
          Munafa = Sale (GST ke baghair) − paddy kharid − mazdoori − kharche − machine − transport, sirf is muddat ka. Stock ki tabdeeli, depreciation aur
          kiraya shamil nahi — pakka hisaab ke liye accountant se closing stock ki qeemat shamil karwayein.
        </div>
      </Panel>

      {costing.data && (() => {
        const c = costing.data;
        const perKg = Number(c.cost_per_kg) || 0;
        const sale = Number(c.sale_per_kg) || 0;
        const margin = sale && perKg ? (sale - perKg) * 40 : null;
        const lines = [
          [`Milling mein lagi paddy: ${fmtNum(c.milled_kg)} kg (${fmt(kgToMaund(c.milled_kg), 1)} md)`, rs(c.paddy_cost)],
          Number(c.drying_kg) ? [`Sukhai mein kami: ${fmtNum(c.drying_kg)} kg`, rs(c.drying_cost)] : null,
          ...c.costs.map((x) => [x.name, rs(x.amount)]),
          ...c.byproducts.map((x) => [`− ${x.product}: ${fmtNum(x.kg)} kg × ${rs(x.per_kg)}/kg (sale rate)`, '− ' + rs(x.value)]),
        ].filter(Boolean);
        return (
          <Panel title="Laagat (Costing) — chawal kitne ka para?" action={<button type="button" className="btn small" onClick={() => printTable({
            title: 'Laagat (Costing)', subtitle: period, columns: [{ label: 'Hisaab' }, { label: 'Rupay', right: true }],
            rows: [...lines, ['Chawal ki kul laagat', rs(c.net_cost)], [`Chawal output: ${fmtNum(c.rice_kg)} kg`, ''],
              ['Laagat fi maund (40 kg)', rs(perKg * 40)], ['Ausat sale rate fi maund', sale ? rs(sale * 40) : '—']],
            totals: ['Munafa fi maund', margin == null ? '—' : rs(margin)],
            notes: 'Paddy ki qeemat = ausat kharid rate (kul raqam ÷ kg). By-products sale ke ausat rate par minus kiye gaye.',
          }, settings)}>Print</button>}>
            <div className="cardgrid">
              <StatCard n={c.rice_kg ? rs(perKg * 40) : '—'} l="Chawal ki laagat fi maund" />
              <StatCard n={sale ? rs(sale * 40) : '—'} l="Ausat sale rate fi maund (chawal + toota)" />
              <StatCard n={margin == null ? '—' : rs(margin)} l="Munafa / nuqsan fi maund" warn={margin != null && margin < 0} good={margin != null && margin > 0} />
              <StatCard n={rs(c.net_cost)} l={`Kul laagat · ${fmt(kgToMaund(c.rice_kg), 1)} md chawal`} />
            </div>
            <div className="tablewrap">
              <table className="data compact">
                <tbody>
                  {lines.map(([k, v]) => <tr key={k}><td className="wrap">{k}</td><td className="r">{v}</td></tr>)}
                  <tr><td><b>Chawal ki kul laagat</b></td><td className="r"><b>{rs(c.net_cost)}</b></td></tr>
                </tbody>
              </table>
            </div>
            <div className="note">Paddy ki qeemat ausat kharid rate (commission samet) se, sukhai ki kami bhi shamil; by-products (phak, toori…) ki qeemat unke ausat sale rate par minus. Jo by-product abhi bika nahi us ki qeemat zero maani gayi.</div>
          </Panel>
        );
      })()}

      <Panel title="Paddy kharid — variety-wise" action={<button type="button" className="btn small" onClick={() => printTable({
        title: 'Variety-wise Kharid', subtitle: period,
        columns: [{ label: 'Variety' }, { label: 'Entries', right: true }, { label: 'Bags', right: true }, { label: 'Kg', right: true }, { label: 'Maund', right: true }, { label: 'Raqam', right: true }, { label: 'Avg rate/maund', right: true }],
        rows: r.byVariety.map((v) => [v.k, v.n, fmt(v.bags), fmtNum(v.kg), fmt(kgToMaund(v.kg), 2), rs(v.amt), rs(v.avg)]),
      }, settings)}>Print</button>}>
        <div className="tablewrap"><table className="data">
          <thead><tr><th>Variety</th><th className="r">Entries</th><th className="r">Bags</th><th className="r">Kg</th><th className="r">Maund</th><th className="r">Raqam</th><th className="r">Avg rate / maund</th></tr></thead>
          <tbody>{r.byVariety.length ? r.byVariety.map((v) => (
            <tr key={v.k}><td>{v.k}</td><td className="r">{v.n}</td><td className="r">{fmt(v.bags)}</td><td className="r">{fmtNum(v.kg)}</td><td className="r">{fmt(kgToMaund(v.kg), 2)}</td><td className="r">{rs(v.amt)}</td><td className="r">{rs(v.avg)}</td></tr>
          )) : <Empty colSpan={7} text="Is muddat mein koi kharid nahi." />}</tbody>
        </table></div>
      </Panel>

      <Panel title="Sale — item-wise" action={<button type="button" className="btn small" onClick={() => printTable({
        title: 'Item-wise Sale', subtitle: period,
        columns: [{ label: 'Item' }, { label: 'Bills', right: true }, { label: 'Kg', right: true }, { label: 'Raqam', right: true }, { label: 'Avg Rs/kg', right: true }, { label: 'Avg Rs/maund', right: true }],
        rows: r.byItem.map((v) => [v.k, v.n, fmtNum(v.kg), rs(v.amt), rs(v.perKg), rs(v.perKg * 40)]),
      }, settings)}>Print</button>}>
        <div className="tablewrap"><table className="data">
          <thead><tr><th>Item</th><th className="r">Bills</th><th className="r">Kg</th><th className="r">Raqam (tax ke baghair)</th><th className="r">Avg Rs/kg</th><th className="r">Avg Rs/maund</th></tr></thead>
          <tbody>{r.byItem.length ? r.byItem.map((v) => (
            <tr key={v.k}><td>{v.k}</td><td className="r">{v.n}</td><td className="r">{fmtNum(v.kg)}</td><td className="r">{rs(v.amt)}</td><td className="r">{rs(v.perKg)}</td><td className="r">{rs(v.perKg * 40)}</td></tr>
          )) : <Empty colSpan={6} text="Is muddat mein koi sale nahi." />}</tbody>
        </table></div>
      </Panel>

      <Panel title="Production — process / variety-wise recovery">
        <div className="tablewrap"><table className="data">
          <thead><tr><th>Process — Variety</th><th className="r">Batches</th><th className="r">Paddy kg</th><th className="r">Chawal kg</th><th className="r">Recovery</th><th className="r">Head rice</th></tr></thead>
          <tbody>{r.byProcess.length ? r.byProcess.map((v) => (
            <tr key={v.k}><td>{v.k}</td><td className="r">{v.n}</td><td className="r">{fmtNum(v.input)}</td><td className="r">{fmtNum(v.rice)}</td><td className="r"><b>{pct(v.rec)}</b></td><td className="r">{pct(v.head)}</td></tr>
          )) : <Empty colSpan={6} text="Is muddat mein koi production nahi." />}</tbody>
        </table></div>
      </Panel>

      <Panel title="Kharche — category-wise">
        <div className="tablewrap"><table className="data">
          <thead><tr><th>Category</th><th className="r">Raqam</th><th className="r">Hissa</th></tr></thead>
          <tbody>{r.byCategory.length ? r.byCategory.map((v) => (
            <tr key={v.k}><td>{v.k}</td><td className="r">{rs(v.amt)}</td><td className="r">{pct(r.totalCost - r.paddyCost ? (v.amt / (r.totalCost - r.paddyCost)) * 100 : 0)}</td></tr>
          )) : <Empty colSpan={3} text="Koi kharcha nahi." />}</tbody>
        </table></div>
      </Panel>

      <Panel title="Mahana khulasa (month-wise)">
        <div className="tablewrap"><table className="data">
          <thead><tr><th>Mahina</th><th className="r">Paddy kg</th><th className="r">Milled kg</th><th className="r">Kharid</th><th className="r">Sale</th><th className="r">Kharche</th><th className="r">Farq</th></tr></thead>
          <tbody>{r.monthly.length ? r.monthly.map(([k, o]) => {
            const d = o.sale - o.purchase - o.cost;
            return (
              <tr key={k}><td>{monthLabel(k)}</td><td className="r">{fmtNum(o.paddyKg)}</td><td className="r">{fmtNum(o.milledKg)}</td><td className="r">{rs(o.purchase)}</td><td className="r">{rs(o.sale)}</td><td className="r">{rs(o.cost)}</td>
                <td className={`r ${d < 0 ? 'neg-text' : ''}`}><b>{rs(d)}</b></td></tr>
            );
          }) : <Empty colSpan={7} text="Koi data nahi." />}</tbody>
        </table></div>
      </Panel>

      <div className="two-col">
        <Panel title="Sab se zyada dena (Payables)">
          <div className="tablewrap"><table className="data">
            <tbody>{payables.length ? payables.map((b) => (
              <tr key={b.party_type + b.party_name}><td><Link to={`/statement?type=${encodeURIComponent(b.party_type)}&name=${encodeURIComponent(b.party_name)}`}>{b.party_name}</Link> <Badge>{b.party_type}</Badge></td><td className="r"><b>{rs(b.balance)}</b></td></tr>
            )) : <Empty colSpan={2} text="Kuch dena baqi nahi." />}</tbody>
          </table></div>
        </Panel>
        <Panel title="Sab se zyada lena (Receivables)">
          <div className="tablewrap"><table className="data">
            <tbody>{receivables.length ? receivables.map((b) => (
              <tr key={b.party_type + b.party_name}><td><Link to={`/statement?type=${encodeURIComponent(b.party_type)}&name=${encodeURIComponent(b.party_name)}`}>{b.party_name}</Link> <Badge>{b.party_type}</Badge></td><td className="r"><b>{rs(Math.abs(b.balance))}</b></td></tr>
            )) : <Empty colSpan={2} text="Kuch lena baqi nahi." />}</tbody>
          </table></div>
        </Panel>
      </div>
    </>
  );
}
