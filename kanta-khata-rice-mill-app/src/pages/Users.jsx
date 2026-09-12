import { useEffect, useState, Fragment } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { ASSIGNABLE_ROLES, ROLE_LABELS, CAN_WRITE, MODULE_LABELS, PERMISSION_MODULES } from '../lib/roles';
import { fmtDate } from '../lib/calc';
import { Panel, Badge, Empty } from '../components/ui';

const emptyCreate = { full_name: '', email: '', password: '', role: 'sales_staff' };

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Turns a profile's `permissions` jsonb ({module: true/false}) into a full
// {module: 'default'|'allow'|'deny'} draft for every editable module.
function permDraftFrom(profile) {
  const overrides = profile.permissions || {};
  const draft = {};
  PERMISSION_MODULES.forEach((m) => {
    draft[m] = Object.prototype.hasOwnProperty.call(overrides, m) ? (overrides[m] ? 'allow' : 'deny') : 'default';
  });
  return draft;
}
function permDraftToJson(draft) {
  const out = {};
  Object.entries(draft).forEach(([m, v]) => { if (v === 'allow') out[m] = true; if (v === 'deny') out[m] = false; });
  return out;
}

export default function Users() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createError, setCreateError] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null); // {email, password} shown once

  const [edits, setEdits] = useState({});
  const [permOpenId, setPermOpenId] = useState('');
  const [permDraft, setPermDraft] = useState({});
  const [resetOpenId, setResetOpenId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    setProfiles(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function callAdminFn(body) {
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body });
    if (error) {
      // Edge Function returned a non-2xx — try to pull the real message out.
      const msg = (await error.context?.json?.().catch(() => null))?.error || error.message;
      return { error: msg };
    }
    if (data?.error) return { error: data.error };
    return { data };
  }

  async function submitCreate(e) {
    e.preventDefault();
    setCreateError(''); setCreatedCreds(null);
    if (createForm.password.length < 8) { setCreateError('Password kam az kam 8 characters ka ho.'); return; }
    setCreateBusy(true);
    const { error } = await callAdminFn({
      action: 'create', email: createForm.email.trim(), password: createForm.password,
      full_name: createForm.full_name.trim(), role: createForm.role,
    });
    setCreateBusy(false);
    if (error) { setCreateError(error); return; }
    setCreatedCreds({ email: createForm.email.trim(), password: createForm.password });
    setCreateForm(emptyCreate);
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

  function togglePermissions(p) {
    setResetOpenId('');
    if (permOpenId === p.id) { setPermOpenId(''); return; }
    setPermDraft(permDraftFrom(p));
    setPermOpenId(p.id);
  }
  async function savePermissions(id) {
    setBusyId(id);
    const { error } = await supabase.rpc('admin_set_permissions', { target_user: id, perms: permDraftToJson(permDraft) });
    setBusyId('');
    if (error) { alert('Permissions save nahi hui: ' + error.message); return; }
    setPermOpenId('');
    load();
  }

  function toggleReset(p) {
    setPermOpenId('');
    setResetError('');
    if (resetOpenId === p.id) { setResetOpenId(''); return; }
    setResetPassword(generatePassword());
    setResetOpenId(p.id);
  }
  async function submitReset(id) {
    setResetError('');
    if (resetPassword.length < 8) { setResetError('Password kam az kam 8 characters ka ho.'); return; }
    setBusyId(id);
    const { error } = await callAdminFn({ action: 'reset_password', target_user: id, password: resetPassword });
    setBusyId('');
    if (error) { setResetError(error); return; }
    alert('Password reset ho gaya. Naya password: ' + resetPassword + '\n\nYeh user ko de dein — dobara yahan nahi dikhega.');
    setResetOpenId('');
  }

  return (
    <>
      <Panel title="Naya Staff Account Banayein">
        <div className="note" style={{ marginBottom: 14 }}>
          Sirf Owner naye staff accounts bana sakta hai — koi khud sign up nahi kar sakta. Naam, email, password aur role daal kar
          account turant ban jayega aur wo shakhs seedha usi password se login kar sakega.
        </div>
        {createError && <div className="auth-error" style={{ marginBottom: 12 }}>{createError}</div>}
        {createdCreds && (
          <div className="auth-ok" style={{ marginBottom: 12 }}>
            Account ban gaya — <b>{createdCreds.email}</b> / <b>{createdCreds.password}</b>. Yeh credentials abhi note kar lein aur
            staff member ko de dein, yeh dobara yahan nahi dikhengi.
          </div>
        )}
        <form onSubmit={submitCreate}>
          <div className="form-grid">
            <div className="field"><label>Full Name</label><input value={createForm.full_name} onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))} required /></div>
            <div className="field"><label>Email</label><input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} required /></div>
            <div className="field">
              <label>Password</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
                <button type="button" className="btn small" onClick={() => setCreateForm((f) => ({ ...f, password: generatePassword() }))}>Generate</button>
              </div>
            </div>
            <div className="field"><label>Role</label>
              <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                {ASSIGNABLE_ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn primary" disabled={createBusy}>{createBusy ? 'Please wait…' : 'Account Banayein'}</button>
        </form>
      </Panel>

      <Panel title="Staff Accounts">
        <div className="note" style={{ marginBottom: 14 }}>
          <b>Permissions</b> se har user ke liye har module <b>Allow</b> ya <b>Deny</b> kiya ja sakta hai — role ke default se hat kar.
          <b> Reset Password</b> se kisi bhi staff member ka password dobara set kiya ja sakta hai (agar bhool jayein).
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Joined</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? <Empty colSpan={5} text="Loading…" /> : profiles.length ? profiles.map((p) => {
                const editing = edits[p.id];
                const overrideCount = Object.keys(p.permissions || {}).length;
                return (
                  <Fragment key={p.id}>
                    <tr>
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
                          <td>
                            <button className="btn small" onClick={() => startEdit(p)}>Edit</button>{' '}
                            {p.role !== 'owner' && (
                              <>
                                <button className="btn small" onClick={() => togglePermissions(p)}>
                                  Permissions{overrideCount > 0 ? ` (${overrideCount})` : ''}
                                </button>{' '}
                                <button className="btn small" onClick={() => toggleReset(p)}>Reset Password</button>
                              </>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                    {permOpenId === p.id && (
                      <tr>
                        <td colSpan={5}>
                          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '12px 14px' }}>
                            <div className="note" style={{ marginBottom: 10 }}>
                              {p.full_name || 'Is user'} ke liye per-module override — role default se zyada ya kam access dene ke liye.
                            </div>
                            <div className="form-grid">
                              {PERMISSION_MODULES.map((m) => (
                                <div className="field" key={m}>
                                  <label>{MODULE_LABELS[m]}</label>
                                  <select value={permDraft[m] || 'default'} onChange={(e) => setPermDraft((d) => ({ ...d, [m]: e.target.value }))}>
                                    <option value="default">Default ({(CAN_WRITE[m] || []).includes(p.role) ? 'Write' : 'View only'})</option>
                                    <option value="allow">Allow (Write)</option>
                                    <option value="deny">Deny (View only)</option>
                                  </select>
                                </div>
                              ))}
                            </div>
                            <button className="btn small primary" disabled={busyId === p.id} onClick={() => savePermissions(p.id)}>Permissions Save Karein</button>{' '}
                            <button className="btn small" onClick={() => setPermOpenId('')}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {resetOpenId === p.id && (
                      <tr>
                        <td colSpan={5}>
                          <div style={{ background: 'var(--paper)', borderRadius: 8, padding: '12px 14px' }}>
                            <div className="note" style={{ marginBottom: 10 }}>{p.full_name || 'Is user'} ke liye naya password set karein.</div>
                            {resetError && <div className="auth-error" style={{ marginBottom: 10 }}>{resetError}</div>}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10, maxWidth: 360 }}>
                              <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={8} />
                              <button type="button" className="btn small" onClick={() => setResetPassword(generatePassword())}>Generate</button>
                            </div>
                            <button className="btn small primary" disabled={busyId === p.id} onClick={() => submitReset(p.id)}>Password Reset Karein</button>{' '}
                            <button className="btn small" onClick={() => setResetOpenId('')}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : <Empty colSpan={5} text="Koi staff account nahi mila." />}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Permission Matrix (role defaults)">
        <div className="note" style={{ marginBottom: 10 }}>Yeh role-based defaults hain. Kisi individual user ke liye inko upar "Permissions" button se override kiya ja sakta hai.</div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Module</th>{ASSIGNABLE_ROLES.map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead>
            <tbody>
              {PERMISSION_MODULES.map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {ASSIGNABLE_ROLES.map((r) => <td key={r}>{r === 'owner' || (CAN_WRITE[m] || []).includes(r) ? <Badge kind="neg">Write</Badge> : <Badge kind="zero">View only</Badge>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
