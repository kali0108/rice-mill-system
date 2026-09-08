import { useSupaTable } from '../hooks/useSupaTable';
import { purchaseCalc, productionCalc, saleCalc, stockCalc, fmt, rs, fmtDate, todayStr, daysBetween, addDays } from '../lib/calc';
import { StatCard, Panel } from '../components/ui';

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

export default function Dashboard() {
  const { rows: purchases, loading: l1 } = useSupaTable('purchases');
  const { rows: production, loading: l2 } = useSupaTable('production_batches');
  const { rows: sales, loading: l3 } = useSupaTable('sales');
  const { rows: ledger, loading: l4 } = useSupaTable('ledger_entries');
  const { rows: payments, loading: l5 } = useSupaTable('payments');
  const { rows: stock, loading: l6 } = useSupaTable('stock_lots');

  if (l1 || l2 || l3 || l4 || l5 || l6) return <div className="empty">Loading…</div>;

  const t = todayStr();
  const totalPaddyIn = purchases.reduce((s, p) => s + purchaseCalc(p).netWt, 0);
  const totalRiceOut = production.reduce((s, b) => s + productionCalc(b).totalRice, 0);
  const overallRecovery = totalPaddyIn ? (totalRiceOut / totalPaddyIn) * 100 : 0;

  const todaysPurchases = purchases.filter((p) => p.date === t);
  const todaysPurchaseAmt = todaysPurchases.reduce((s, p) => s + purchaseCalc(p).amount, 0);
  const todaysSales = sales.filter((s) => s.date === t);
  const todaysSaleAmt = todaysSales.reduce((s, x) => s + saleCalc(x).netAmount, 0);

  const balances = partyBalances(ledger);
  const payable = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const receivable = balances.filter((b) => b.balance < 0).reduce((s, b) => s + Math.abs(b.balance), 0);

  const cheques = payments.filter((p) => p.method === 'Cheque' && p.status === 'Pending');
  const chequesDueSoon = cheques.filter((c) => daysBetween(t, c.due_date) <= 3);

  const fumigationAlerts = stock.filter((s) => {
    if (!s.last_fumigation) return true;
    return daysBetween(t, addDays(s.last_fumigation, 30)) <= 7;
  });
  const ageingStock = stock.filter((s) => daysBetween(s.date_in, t) > 60);

  const alerts = [];
  cheques.forEach((c) => {
    const d = daysBetween(t, c.due_date);
    const tag = d < 0 ? <span className="tag overdue">Overdue {Math.abs(d)}d</span> : d <= 3 ? <span className="tag soon">Due in {d}d</span> : <span className="tag ok">Due in {d}d</span>;
    alerts.push(<div className="alertrow" key={'c' + c.id}><span>Cheque #{c.cheque_no} — {c.party_name} ({c.direction}, {rs(c.amount)})</span>{tag}</div>);
  });
  fumigationAlerts.forEach((s) => {
    const tag = !s.last_fumigation
      ? <span className="tag overdue">Not recorded</span>
      : daysBetween(t, addDays(s.last_fumigation, 30)) < 0
      ? <span className="tag overdue">Overdue</span>
      : <span className="tag soon">Due soon</span>;
    alerts.push(<div className="alertrow" key={'f' + s.id}><span>Fumigation — {s.godown} / Lot {s.lot_no}</span>{tag}</div>);
  });
  ageingStock.forEach((s) => {
    alerts.push(<div className="alertrow" key={'a' + s.id}><span>Stock ageing — {s.godown} / Lot {s.lot_no} ({daysBetween(s.date_in, t)} din se pada hai)</span><span className="tag soon">Ageing</span></div>);
  });

  return (
    <>
      <div className="hero">
        <div>
          <div className="big">{overallRecovery.toFixed(1)}%</div>
          <div className="biglabel">Season Recovery — kitni paddy se kitna chawal (all grades)</div>
        </div>
        <div className="sidefacts">
          <div><span className="n">{fmt(totalPaddyIn)} kg</span><span className="l">Total Paddy Purchased</span></div>
          <div><span className="n">{fmt(totalRiceOut)} kg</span><span className="l">Total Rice Produced</span></div>
          <div><span className="n">{purchases.length}</span><span className="l">Purchase Entries</span></div>
        </div>
      </div>

      <div className="cardgrid">
        <StatCard n={rs(todaysPurchaseAmt)} l={`Aaj ki Purchase (${todaysPurchases.length} entries)`} />
        <StatCard n={rs(todaysSaleAmt)} l={`Aaj ki Sale (${todaysSales.length} bills)`} />
        <StatCard n={rs(payable)} l="Pending Payable (Kisan/Arhti/Supplier)" warn={payable > 0} />
        <StatCard n={rs(receivable)} l="Pending Receivable (Customers)" />
        <StatCard n={chequesDueSoon.length} l="Cheques Due (≤3 din)" warn={chequesDueSoon.length > 0} />
        <StatCard n={stock.length} l="Active Stock Lots" />
      </div>

      <Panel title="Alerts & Reminders">
        <div className="alertlist">
          {alerts.length ? alerts : <div className="empty">Koi urgent alert nahi hai — sab theek hai.</div>}
        </div>
      </Panel>
    </>
  );
}
