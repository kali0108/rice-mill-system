import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ROLES, ROLE_LABELS } from '../lib/roles';
import { fmtDate } from '../lib/calc';
import { Panel, Empty } from '../components/ui';

export default function Users() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function changeRole(id, role) {
    setSaving(id);
    const { error } = await supabase.rpc('set_user_role', { target_user: id, new_role: role });
    setSaving('');
    if (error) { alert('Role change nahi hua: ' + error.message); return; }
    load();
  }

  return (
    <Panel title="Staff Accounts">
      <div className="note" style={{ marginBottom: 14 }}>
        Naya staff member khud <b>Sign Up</b> se apna account bana sakta hai (login screen par) — wo default "Sales Staff" ban'ta hai.
        Yahan se aap uska sahi role set kar sakte hain. Har module ki write-permission role ke mutabiq hai (Munshi = paisay wale modules, Godown Incharge = mill-floor modules, Sales Staff = sirf sales).
      </div>
      <div className="tablewrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Joined</th><th>Role</th></tr></thead>
          <tbody>
            {loading ? <Empty colSpan={3} text="Loading…" /> : rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name || '(no name)'} {r.id === user?.id && <span className="badge zero">You</span>}</td>
                <td>{fmtDate((r.created_at || '').slice(0, 10))}</td>
                <td>
                  <select value={r.role} disabled={saving === r.id} onChange={(e) => changeRole(r.id, e.target.value)}>
                    {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </td>
              </tr>
            )) : <Empty colSpan={3} text="Koi staff account nahi mila." />}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
