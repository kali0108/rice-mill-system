import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fmtDate } from '../lib/calc';
import { Panel, Badge, Empty } from '../components/ui';
import { MODULE_LABELS } from '../lib/roles';

const PAGE_SIZE = 60;

const TABLE_LABELS = {
  purchases: MODULE_LABELS.purchase, ledger_entries: MODULE_LABELS.ledger, production_batches: MODULE_LABELS.production,
  stock_lots: MODULE_LABELS.stock, sales: MODULE_LABELS.sales, payments: MODULE_LABELS.payments,
  labor_entries: MODULE_LABELS.labor, transport_entries: MODULE_LABELS.transport, machinery_log: MODULE_LABELS.machinery,
  expenses: MODULE_LABELS.expenses, tax_records: MODULE_LABELS.tax, zakat_assessments: 'Zakat',
};

function summarize(details) {
  if (!details) return '—';
  const key = details.farmer_name || details.customer || details.party_name || details.name || details.lot_no || details.machine || details.godown;
  const amount = details.amount ?? details.net_amount ?? details.net_payable ?? details.tax_amount ?? details.zakat_due;
  return [key, amount != null ? `Rs ${Math.round(amount).toLocaleString('en-US')}` : null].filter(Boolean).join(' — ') || '—';
}

function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  async function loadNames() {
    const { data } = await supabase.from('profiles').select('id, full_name');
    const map = {};
    (data || []).forEach((p) => { map[p.id] = p.full_name || 'Unnamed'; });
    setNames(map);
  }

  async function load(reset) {
    setLoading(true);
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false });
    if (tableFilter !== 'all') q = q.eq('table_name', tableFilter);
    if (actionFilter !== 'all') q = q.eq('action', actionFilter);
    const from = reset ? 0 : rows.length;
    const { data } = await q.range(from, from + PAGE_SIZE - 1);
    setRows(reset ? (data || []) : [...rows, ...(data || [])]);
    setHasMore((data || []).length === PAGE_SIZE);
    setLoading(false);
  }

  useEffect(() => { loadNames(); }, []);
  useEffect(() => { load(true); /* eslint-disable-next-line */ }, [tableFilter, actionFilter]);

  return (
    <Panel title="Activity Log — kon, kya, kab">
      <div className="filterbar">
        <div className="field">
          <label>Module</label>
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
            <option value="all">Sab Modules</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Action</label>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">Sab Actions</option>
            <option value="INSERT">Created</option>
            <option value="UPDATE">Edited</option>
            <option value="DELETE">Deleted</option>
          </select>
        </div>
      </div>

      <div className="tablewrap">
        <table className="data">
          <thead><tr><th>When</th><th>Who</th><th>Module</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtWhen(r.created_at)}</td>
                <td>{names[r.user_id] || 'Unknown'}</td>
                <td>{TABLE_LABELS[r.table_name] || r.table_name}</td>
                <td>
                  {r.action === 'INSERT' && <Badge kind="neg">Created</Badge>}
                  {r.action === 'UPDATE' && <Badge kind="zero">Edited</Badge>}
                  {r.action === 'DELETE' && <Badge kind="pos">Deleted</Badge>}
                </td>
                <td>{summarize(r.details)}</td>
              </tr>
            )) : !loading && <Empty colSpan={5} text="Koi activity nahi mili." />}
          </tbody>
        </table>
      </div>
      {loading && <div className="note">Loading…</div>}
      {!loading && hasMore && (
        <button className="btn small" style={{ marginTop: 12 }} onClick={() => load(false)}>Load More</button>
      )}
    </Panel>
  );
}
