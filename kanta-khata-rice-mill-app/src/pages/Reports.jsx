import { useState } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { purchaseCalc, productionCalc, saleCalc, laborCalc, rs, fmt, todayStr } from '../lib/calc';
import { Panel, Badge, Empty, StatCard } from '../components/ui';

function partyBalances(ledger) {
  const map = {};
  ledger.forEach((e) => {
    const key = e.party_type + '||' + e.party_name;
    if (!map[key]) map[key] = { partyType: e.party_type, partyName: e.party_name, debit: 0, credit: 0 };
    map[key].debit += Number(e.debit) || 0;
    map[key].credit += Number(e.credit) || 0;
  });
  return Object.values(map).map((m) => ({ ...m, balance: m.credit - m.debit }));
}

export default function Reports() {
  const purchases = useSupaTable('purchases');
  const sales = useSupaTable('sales');
  const production = useSupaTable('production_batches');
  const ledger = useSupaTable('ledger_entries');
  const labor = useSupaTable('labor_entries');
  const expenses = useSupaTable('expenses');
  const machinery = useSupaTable('machinery_log');
  const transport = useSupaTable('transport_entries');

  const t = todayStr();
  const [from, setFrom] = useState(t.slice(0, 8) + '01');
  const [to, setTo] = useState(t);
  const inRange = (d) => d >= from && d <= to;

  const loading = [purchases, sales, production, ledger, labor, expenses, machinery, transport].some((x) => x.loading);
  if (loading) return <div className="empty">Loading…</div>;

  const purch = purchases.rows.filter((p) => inRange(p.date));
  const sale = sales.rows.filter((s) => inRange(s.date));
  const prod = production.rows.filter((b) => inRange(b.date));
  const lab = labor.rows.filter((l) => inRange(l.date));
  const exp = expenses.rows.filter((x) => inRange(x.date));
  const mach = machinery.rows.filter((m) => inRange(m.date));
  const trans = transport.rows.filter((x) => inRange(x.date));

  const purchTotal = purch.reduce((s, p) => s + purchaseCalc(p).amount, 0);
  const saleTotal = sale.reduce((s, x) => s + saleCalc(x).netAmount, 0);
  const paddyIn = prod.reduce((s, b) => s + Number(b.paddy_input_kg), 0);
  const riceOut = prod.reduce((s, b) => s + productionCalc(b).totalRice, 0);
  const recovery = paddyIn ? (riceOut / paddyIn) * 100 : 0;
  const laborTotal = lab.reduce((s, l) => s + laborCalc(l).net, 0);
  const expenseTotal = exp.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const machineryTotal = mach.reduce((s, m) => s + (Number(m.cost) || 0), 0);
  const freightTotal = trans.reduce((s, x) => s + (Number(x.freight_amount) || 0), 0);
  const commissionTotal = trans.reduce((s, x) => s + (Number(x.commission_amount) || 0), 0);

  const totalCosts = purchTotal + laborTotal + expenseTotal + machineryTotal + freightTotal + commissionTotal;
  const netPL = saleTotal - totalCosts;

  const balances = partyBalances(ledger.rows).filter((b) => b.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  return (
    <>
      <Panel title="Report Date Range">
        <div className="filterbar">
          <div className="field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>

        <div className="cardgrid" style={{ marginTop: 16 }}>
          <StatCard n={rs(purchTotal)} l={`Total Purchase (${purch.length} entries)`} />
          <StatCard n={rs(saleTotal)} l={`Total Sale — Net (${sale.length} bills)`} />
          <StatCard n={rs(laborTotal)} l="Labor / Wages (net)" />
          <StatCard n={rs(expenseTotal)} l="Daily Expenses" />
          <StatCard n={rs(machineryTotal)} l="Machinery Maintenance Cost" />
          <StatCard n={rs(freightTotal + commissionTotal)} l="Freight + Arhti Commission" />
          <StatCard n={fmt(paddyIn) + ' kg'} l="Paddy Processed" />
          <StatCard n={fmt(riceOut) + ' kg'} l="Rice Produced" />
          <StatCard n={recovery.toFixed(1) + '%'} l="Recovery % (range)" />
          <StatCard n={rs(netPL)} l="Net P&L (Sale − all costs above)" warn={netPL < 0} />
        </div>
        <div className="note">Net P&amp;L = Sale minus Purchase, Labor, Daily Expenses, Machinery Cost, aur Freight/Commission — is date range ke liye. Depreciation, rent aur bade capital kharche is mein shamil nahi.</div>
      </Panel>

      <Panel title="Party Balances (Payable / Receivable)">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Party Type</th><th>Party</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              {balances.length ? balances.map((b) => (
                <tr key={b.partyType + b.partyName}>
                  <td>{b.partyType}</td><td>{b.partyName}</td><td>{rs(Math.abs(b.balance))}</td>
                  <td>{b.balance > 0 ? <Badge kind="pos">Mill Owes Party</Badge> : <Badge kind="neg">Party Owes Mill</Badge>}</td>
                </tr>
              )) : <Empty colSpan={4} text="Sab accounts settled hain." />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
