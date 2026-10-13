import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRpc, WATCH } from '../hooks/useRpc';
import { useSupaTable } from '../hooks/useSupaTable';
import { useParties, useSettings } from '../context/DataContext';
import { fmt, fmtNum, rs, pct, kgToMaund, sum } from '../lib/calc';
import { todayStr, fmtDate, daysBetween, addDays } from '../lib/dates';
import { machineStatus } from '../lib/mill';
import { StatCard, Panel, Badge, Loading } from '../components/ui';
import { BarChart, bucketLabel, PALETTE } from '../components/charts';
import { T } from '../lib/i18n';

export default function Dashboard() {
  const t = todayStr();
  const { settings } = useSettings();
  const { balances } = useParties();
  const stats = useRpc('get_dashboard_stats', { p_today: t, p_season_start: settings.season_start || null }, { watch: WATCH.dashboard });
  const cash = useRpc('get_cash_balances', { p_before: null }, { watch: WATCH.cash });
  const stock = useRpc('get_stock_summary', {}, { watch: WATCH.stock });
  const cheques = useSupaTable('payments', { eq: { method: 'Cheque', status: 'Pending' }, orderBy: 'due_date', ascending: true });
  const lots = useSupaTable('stock_lots', { orderBy: 'date_in', eq: { status: 'In Stock' } });
  const machines = useSupaTable('machinery_log', { from: addDays(t, -730) });
  const trend = useRpc('get_analytics', { p_from: addDays(t, -13), p_to: t, p_bucket: 'day' }, { watch: WATCH.dashboard });

  const s = stats.data || {};
  const cashMap = useMemo(() => {
    const m = { Cash: 0, Bank: 0 };
    (cash.data || []).forEach((b) => { m[b.account] = Number(b.balance); });
    return m;
  }, [cash.data]);
  const payable = sum(balances.filter((b) => Number(b.balance) > 0), 'balance');
  const receivable = Math.abs(sum(balances.filter((b) => Number(b.balance) < 0), 'balance'));
  const milled = Number(s.season_milled_kg) || 0;
  const recovery = milled ? (Number(s.season_rice_kg) / milled) * 100 : 0;
  const headRice = milled ? (Number(s.season_fullgrain_kg) / milled) * 100 : 0;
  const stockLines = useMemo(() => (stock.data || []).filter((l) => Math.abs(Number(l.balance_kg)) >= 0.5), [stock.data]);
  const paddyStock = sum(stockLines.filter((l) => l.item === 'Paddy'), 'balance_kg');
  const riceStock = sum(stockLines.filter((l) => l.category === 'rice'), 'balance_kg');
  const brokenStock = sum(stockLines.filter((l) => l.category === 'broken'), 'balance_kg');

  const alerts = useMemo(() => {
    const out = [];
    const fumDays = Number(settings.fumigation_days) || 30;
    const ageDays = Number(settings.ageing_days) || 60;
    cheques.rows.forEach((c) => {
      const d = daysBetween(t, c.due_date);
      if (Number.isNaN(d) || d > 7) return;
      out.push({
        key: 'c' + c.id, sort: d, to: '/payments',
        text: `Cheque #${c.cheque_no} — ${c.party_name} (${c.direction === 'Paid' ? 'diya' : 'liya'}, ${rs(c.amount)})`,
        tag: d < 0 ? <Badge kind="bounced">{T("Overdue ")}{Math.abs(d)}{T(" din")}</Badge> : <Badge kind="pending">{d === 0 ? T("Aaj") : `${d}${T(" din mein")}`}</Badge>,
      });
    });
    lots.rows.forEach((l) => {
      if (!l.last_fumigation) {
        out.push({ key: 'f' + l.id, sort: 50, to: '/stock', text: `Fumigation darj nahi — ${l.godown} / Lot ${l.lot_no}`, tag: <Badge kind="pos">{T("Darj nahi")}</Badge> });
      } else {
        const d = daysBetween(t, addDays(l.last_fumigation, fumDays));
        if (d <= 7) out.push({ key: 'f' + l.id, sort: d, to: '/stock', text: `Fumigation — ${l.godown} / Lot ${l.lot_no}`, tag: d < 0 ? <Badge kind="bounced">{T("Overdue")}</Badge> : <Badge kind="pending">{d}{T(" din mein")}</Badge> });
      }
      const age = daysBetween(l.date_in, t);
      if (age > ageDays) out.push({ key: 'a' + l.id, sort: 60, to: '/stock', text: `Purana stock — ${l.godown} / Lot ${l.lot_no} (${age} din se)`, tag: <Badge kind="pending">{T("Ageing")}</Badge> });
    });
    machineStatus(machines.rows).forEach((m) => {
      if (m.status === 'Under Repair') out.push({ key: 'r' + m.id, sort: 5, to: '/expenses', text: `${m.machine} repair mein hai${m.issue_description ? ' — ' + m.issue_description : ''}`, tag: <Badge kind="bounced">{T("Band")}</Badge> });
      if (m.next_service_due) {
        const d = daysBetween(t, m.next_service_due);
        if (d <= 7) out.push({ key: 's' + m.id, sort: d, to: '/expenses', text: `${m.machine} ki service`, tag: d < 0 ? <Badge kind="bounced">{Math.abs(d)}{T(" din overdue")}</Badge> : <Badge kind="pending">{d === 0 ? T("Aaj") : `${d}${T(" din mein")}`}</Badge> });
      }
    });
    stockLines.filter((l) => Number(l.balance_kg) < -0.5).forEach((l) => {
      out.push({ key: 'n' + l.item + l.variety, sort: 40, to: '/stock', text: `Manfi stock: ${l.item}${l.variety ? ' (' + l.variety + ')' : ''} ${fmtNum(l.balance_kg)} kg — koi entry reh gayi hai`, tag: <Badge kind="bounced">{T("Check")}</Badge> });
    });
    if (Number(s.unpaid_wages) > 0) {
      out.push({ key: 'w', sort: 70, to: '/labor', text: `Mazdoori baqaya: ${rs(s.unpaid_wages)} (${s.unpaid_wage_count} entries)`, tag: <Badge kind="pending">{T("Baqaya")}</Badge> });
    }
    return out.sort((a, b) => a.sort - b.sort);
  }, [cheques.rows, lots.rows, machines.rows, stockLines, settings.fumigation_days, settings.ageing_days, s.unpaid_wages, s.unpaid_wage_count, t]);

  if (stats.loading && !stats.data) return <Loading />;

  return (
    <>
      <div className="hero">
        <div>
          <div className="big">{pct(recovery)}</div>
          <div className="biglabel">{T("Recovery ")}{settings.season_start ? `${T("(season ")}${fmtDate(settings.season_start)}${T(" se)")}` : T("(shuru se)")}{T(" — milled paddy se chawal · Head rice ")}{pct(headRice)}
          </div>
        </div>
        <div className="sidefacts">
          <div><span className="n">{fmt(kgToMaund(s.season_paddy_kg), 0)}{T(" md")}</span><span className="l">{T("Paddy kharidi (")}{fmt(s.season_purchase_count)}{T(" entries)")}</span></div>
          <div><span className="n">{fmt(kgToMaund(milled), 0)}{T(" md")}</span><span className="l">{T("Paddy milled")}</span></div>
          <div><span className="n">{fmt(kgToMaund(paddyStock), 0)}{T(" md")}</span><span className="l">{T("Paddy stock")}</span></div>
          <div><span className="n">{fmt(kgToMaund(riceStock), 0)}{T(" md")}</span><span className="l">{T("Chawal stock (full grain)")}</span></div>
          <div><span className="n">{fmt(kgToMaund(brokenStock), 0)}{T(" md")}</span><span className="l">{T("Toota / Kanki stock")}</span></div>
        </div>
      </div>

      <div className="cardgrid">
        <StatCard n={rs(s.today_purchase_amount)} l={`${T("Aaj ki kharid (")}${fmt(s.today_purchase_count)} · ${fmt(kgToMaund(s.today_purchase_kg), 1)}${T(" md)")}`} />
        <StatCard n={rs(s.today_sale_amount)} l={`${T("Aaj ki sale (")}${fmt(s.today_sale_count)}${T(" bills)")}`} />
        <StatCard n={rs(cashMap.Cash)} l={T("Cash in hand")} warn={cashMap.Cash < 0} />
        <StatCard n={rs(cashMap.Bank)} l={T("Bank balance")} warn={cashMap.Bank < 0} />
        <StatCard n={rs(payable)} l={T("Mill ne dena hai (Kisan/Arhti/Supplier…)")} warn={payable > 0} />
        <StatCard n={rs(receivable)} l={T("Mill ne lena hai (Customers…)")} />
      </div>

      {trend.data && (
        <Panel title={T("Pichle 14 din — kharid vs sale")} action={<Link className="btn small" to="/analytics">{T("Poori Stats")}</Link>}>
          <BarChart
            labels={trend.data.series.map((p) => bucketLabel(p.b, 'day'))}
            series={[
              { name: T("Kharid"), values: trend.data.series.map((p) => Number(p.purchase_payable) || 0), color: PALETTE[1] },
              { name: T("Sale"), values: trend.data.series.map((p) => Number(p.sale_value) || 0), color: PALETTE[0] },
            ]}
            height={190}
          />
        </Panel>
      )}

      <Panel title={`${T("Alerts & Reminders (")}${alerts.length})`}>
        <div className="alertlist">
          {alerts.length ? alerts.map((a) => (
            <Link to={a.to} className="alertrow" key={a.key}><span>{a.text}</span>{a.tag}</Link>
          )) : <div className="empty">{T("Koi zaroori alert nahi — sab theek hai.")}</div>}
        </div>
      </Panel>

      <Panel title={T("Stock (aaj tak)")} action={<Link className="btn small" to="/stock">{T("Tafseel")}</Link>}>
        <div className="tablewrap">
          <table className="data compact">
            <thead><tr><th>{T("Item")}</th><th>{T("Variety")}</th><th className="r">{T("Kg")}</th><th className="r">{T("Maund")}</th></tr></thead>
            <tbody>
              {stockLines.length ? stockLines.map((l) => (
                <tr key={l.item + l.variety} className={Number(l.balance_kg) < 0 ? 'warnrow' : ''}>
                  <td>{l.item}</td><td>{l.variety || '—'}</td><td className="r">{fmtNum(l.balance_kg)}</td><td className="r">{fmt(kgToMaund(l.balance_kg), 1)}</td>
                </tr>
              )) : <tr><td colSpan={4} className="empty">{T("Abhi stock khali hai.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
