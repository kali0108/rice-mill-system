import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ASSIGNABLE_ROLES, ROLE_LABELS, CAN_WRITE, MODULE_LABELS } from '../lib/roles';
import { fmtDate } from '../lib/calc';
import { Panel, Badge, Empty } from '../components/ui';

const emptyInvite = { email: '', full_name: '', role: 'sales_staff' };

export default function Users() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [inviteError, setInviteError] = useState('');
  const [edits, setEdits] = useState({}); // id -> {full_name, role, status} draft while editing

  async function load() {
    setLoading(true);
    const [p, i] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('invited_emails').select('*').eq('used', false).order('invited_at', { ascending: false }),
    ]);
    setProfiles(p.data || []);
    setInvites(i.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submitInvite(e) {
    e.preventDefault();
    setInviteError('');
    const { error } = await supabase.rpc('invite_user', {
      target_email: inviteForm.email.trim(), target_full_name: inviteForm.full_name.trim(), target_role: inviteForm.role,
    });
    if (error) { setInviteError(error.message); return; }
    setInviteForm(emptyInvite);
    load();
  }

  async function revokeInvite(email) {
    await supabase.rpc('revoke_invite', { target_email: email });
    load();
  }

  function startEdit(p) {
    setEdits((e) => ({ ...e, [p.id]: { full_name: p.full_name || '', role: p.role, status: p.status } }));
  }
  function cancelEdit(id) {
    setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
  }
  function draftChange(id, key, value) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], [key]: value } }));
  }
  async function saveEdit(id) {
    const draft = edits[id];
    setBusyId(id);
    const { error } = await supabase.rpc('admin_update_profile', {
      target_user: id, new_full_name: draft.full_name, new_role: draft.role, new_status: draft.status,
    });
    setBusyId('');
    if (error) { alert('Update nahi hua: ' + error.message); return; }
    cancelEdit(id);
    load();
  }

  return (
    <>
      <Panel title="Naya Staff Invite Karein">
        <div className="note" style={{ marginBottom: 14 }}>
          Email daalein aur role choose karein — jab wo shakhs is email se <b>Sign Up</b> karega, use turant sahi role mil jayega
          (koi manual approval ki zaroorat nahi). Agar koi bina invite ke sign up kare, wo "Pending Approval" mein rahega
          jab tak aap use neeche se approve na karein.
        </div>
        {inviteError && <div className="auth-error" style={{ marginBottom: 12 }}>{inviteError}</div>}
        <form onSubmit={submitInvite}>
          <div className="form-grid">
            <div className="field"><label>Email</label><input type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} required /></div>
            <div className="field"><label>Full Name</label><input value={inviteForm.full_name} onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="field"><label>Role</label>
              <select value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn primary">Invite Bhejein</button>
        </form>
      </Panel>

      {invites.length > 0 && (
        <Panel title="Pending Invites (abhi sign up nahi hua)">
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Invited</th><th></th></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.email}>
                    <td>{i.email}</td><td>{i.full_name || '—'}</td><td>{ROLE_LABELS[i.role]}</td>
                    <td>{fmtDate((i.invited_at || '').slice(0, 10))}</td>
                    <td><button className="btn small danger" onClick={() => revokeInvite(i.email)}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Staff Accounts">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Joined</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? <Empty colSpan={5} text="Loading…" /> : profiles.length ? profiles.map((p) => {
                const editing = edits[p.id];
                return (
                  <tr key={p.id}>
                    {editing ? (
                      <>
                        <td><input value={editing.full_name} onChange={(e) => draftChange(p.id, 'full_name', e.target.value)} style={{ width: 140 }} /></td>
                        <td>{fmtDate((p.created_at || '').slice(0, 10))}</td>
                        <td>
                          <select value={editing.role} onChange={(e) => draftChange(p.id, 'role', e.target.value)}>
                            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={editing.status} onChange={(e) => draftChange(p.id, 'status', e.target.value)}>
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                          </select>
                        </td>
                        <td>
                          <button className="btn small primary" disabled={busyId === p.id} onClick={() => saveEdit(p.id)}>Save</button>{' '}
                          <button className="btn small" onClick={() => cancelEdit(p.id)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{p.full_name || '(no name)'} {p.id === user?.id && <Badge kind="zero">You</Badge>}</td>
                        <td>{fmtDate((p.created_at || '').slice(0, 10))}</td>
                        <td>{ROLE_LABELS[p.role]}</td>
                        <td>{p.status === 'active' ? <Badge kind="neg">Active</Badge> : <Badge kind="pos">Suspended</Badge>}</td>
                        <td><button className="btn small" onClick={() => startEdit(p)}>Edit</button></td>
                      </>
                    )}
                  </tr>
                );
              }) : <Empty colSpan={5} text="Koi staff account nahi mila." />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Permission Matrix (reference)">
        <div className="note" style={{ marginBottom: 10 }}>Role assign karna hi permission grant karna hai — har role ke paas neeche diye modules mein hi entry/edit ka access hota hai. Sab roles har module <b>dekh</b> sakte hain, farq sirf likhne (write) ka hai.</div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Module</th>{ASSIGNABLE_ROLES.map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead>
            <tbody>
              {Object.keys(MODULE_LABELS).filter((m) => m !== 'users').map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {ASSIGNABLE_ROLES.map((r) => <td key={r}>{(CAN_WRITE[m] || []).includes(r) ? <Badge kind="neg">Write</Badge> : <Badge kind="zero">View only</Badge>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
