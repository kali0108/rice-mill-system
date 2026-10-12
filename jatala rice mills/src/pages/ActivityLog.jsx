import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fmtDateTime } from '../lib/dates';
import { TABLES } from '../lib/schema';
import { friendlyError } from '../lib/errors';
import { useToast } from '../context/ToastContext';
import { Panel, Badge, Empty, Field } from '../components/ui';

const PAGE = 60;
const LABELS = { ...Object.fromEntries(Object.entries(TABLES).map(([k, v]) => [k, v.label])), settings: 'Mill Settings', system: 'System' };

const SKIP = new Set(['created_at', 'updated_at', 'created_by', 'id']);
function changes(oldD, newD) {
  if (!oldD || !newD) return [];
  return Object.keys(newD).filter((k) => !SKIP.has(k) && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
    .map((k) => ({ k, from: oldD[k], to: newD[k] }));
}
const show = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function summarize(d) {
  if (!d) return '—';
  const who = d.slip_no || d.invoice_no || d.farmer_name || d.arhti_name || d.customer || d.party_name || d.name || d.lot_no || d.machine || d.godown || d.category || d.message || '';
  const amt = d.total_payable ?? d.net_amount ?? d.amount ?? d.net_pay ?? d.cost ?? d.tax_amount ?? d.zakat_due ?? d.debit ?? null;
  return [who, amt != null && Number(amt) ? `Rs ${Math.round(Number(amt)).toLocaleString('en-US')}` : null].filter(Boolean).join(' — ') || '—';
}

const ACTION = {
  INSERT: <Badge kind="neg">Nayi</Badge>, UPDATE: <Badge kind="zero">Tabdeeli</Badge>, DELETE: <Badge kind="bounced">Delete</Badge>,
  RESET: <Badge kind="bounced">RESET</Badge>, RESTORE: <Badge kind="pending">RESTORE</Badge>,
};

export default function ActivityLog() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [table, setTable] = useState('all');
  const [action, setAction] = useState('all');
  const [open, setOpen] = useState(null);

  const fetchPage = useCallback(async (offset) => {
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
    if (table !== 'all') q = q.eq('table_name', table);
    if (action !== 'all') q = q.eq('action', action);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) toast.error(friendlyError(error));
    return data || [];
  }, [table, action, toast]);

  useEffect(() => {
    let alive = true;
    supabase.from('profiles').select('id, full_name').then(({ data }) => {
      if (alive) setNames(Object.fromEntries((data || []).map((p) => [p.id, p.full_name || 'Naam nahi'])));
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPage(0).then((data) => {
      if (!alive) return;
      setRows(data);
      setHasMore(data.length === PAGE);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [fetchPage]);

  async function more() {
    setLoading(true);
    const data = await fetchPage(rows.length);
    setRows((r) => [...r, ...data]);
    setHasMore(data.length === PAGE);
    setLoading(false);
  }

  return (
    <Panel title="Activity Log — kis ne, kya, kab">
      <div className="filterbar">
        <Field label="Module">
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="all">Sab</option>
            {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Kaam">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">Sab</option><option value="INSERT">Nayi entry</option><option value="UPDATE">Tabdeeli</option>
            <option value="DELETE">Delete</option><option value="RESET">Reset</option><option value="RESTORE">Restore</option>
          </select>
        </Field>
      </div>
      <div className="tablewrap">
        <table className="data">
          <thead><tr><th>Kab</th><th>Kis ne</th><th>Module</th><th>Kaam</th><th>Tafseel</th><th></th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{r.user_id ? names[r.user_id] || 'Purana/delete user' : 'System'}</td>
                  <td>{LABELS[r.table_name] || r.table_name}</td>
                  <td>{ACTION[r.action] || r.action}</td>
                  <td className="wrap">
                    {summarize(r.details)}
                    {r.action === 'UPDATE' && changes(r.old_details, r.details).slice(0, 3).map((c) => (
                      <div key={c.k} className="muted">{c.k}: {show(c.from)} → {show(c.to)}</div>
                    ))}
                  </td>
                  <td><button type="button" className="btn small" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Band' : 'Poori'}</button></td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={6}>
                    {r.action === 'UPDATE' && r.old_details ? (
                      <table className="data compact">
                        <thead><tr><th>Khana</th><th>Pehle</th><th>Baad mein</th></tr></thead>
                        <tbody>{changes(r.old_details, r.details).map((c) => <tr key={c.k}><td>{c.k}</td><td className="wrap">{show(c.from)}</td><td className="wrap">{show(c.to)}</td></tr>)}</tbody>
                      </table>
                    ) : <pre className="json">{JSON.stringify(r.details, null, 2)}</pre>}
                  </td></tr>
                )}
              </Fragment>
            )) : !loading && <Empty colSpan={6} text="Koi activity nahi mili." />}
          </tbody>
        </table>
      </div>
      {loading && <div className="note">Loading…</div>}
      {!loading && hasMore && <button type="button" className="btn small" onClick={more}>Aur dikhayein</button>}
    </Panel>
  );
}
