import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ASSIGNABLE_ROLES, ROLE_LABELS, CAN_WRITE, MODULE_LABELS, PERMISSION_MODULES } from '../lib/roles';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { Panel, Badge, Empty, Field } from '../components/ui';

const emptyCreate = { full_name: '', email: '', password: '', role: 'munshi' };

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

function permDraftFrom(p) {
  const o = p.permissions || {};
  const d = {};
  PERMISSION_MODULES.forEach((m) => {
    d[m] = Object.prototype.hasOwnProperty.call(o, m) ? (o[m] ? 'allow' : 'deny') : 'default';
  });
  return d;
}
function permDraftToJson(d) {
  const out = {};
  Object.entries(d).forEach(([m, v]) => {
    if (v === 'allow') out[m] = true;
    if (v === 'deny') out[m] = false;
  });
  return out;
}

async function callAdminFn(body) {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body });
  if (error) {
    if (/failed to send a request|FunctionsFetchError/i.test(error.message || error.name || '')) {
      return { error: 'Edge Function "admin-create-user" tak rabta nahi ho saka — shayad deploy nahi hui. DEPLOYMENT_GUIDE ka "Edge Function" hissa dekhein.' };
    }
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.error) msg = j.error;
    } catch { /* body not JSON */ }
    return { error: msg };
  }
  if (data?.error) return { error: data.error };
  return { data };
}

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [emails, setEmails] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createBusy, setCreateBusy] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [edits, setEdits] = useState({});
  const [permOpenId, setPermOpenId] = useState('');
  const [permDraft, setPermDraft] = useState({});
  const [resetOpenId, setResetOpenId] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) toast.error(friendlyError(error));
    setProfiles(data || []);
    setLoading(false);
    const res = await callAdminFn({ action: 'list' });
    if (res.data?.users) setEmails(Object.fromEntries(res.data.users.map((u) => [u.id, u.email])));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitCreate(e) {
    e.preventDefault();
    if (createBusy) return;
    setCreatedCreds(null);
    if (createForm.password.length < 8) return toast.error('Password kam az kam 8 characters ka ho.');
    setCreateBusy(true);
    const res = await callAdminFn({ action: 'create', email: createForm.email.trim(), password: createForm.password, full_name: createForm.full_name.trim(), role: createForm.role });
    setCreateBusy(false);
    if (res.error) return toast.error(res.error);
    setCreatedCreds({ email: createForm.email.trim(), password: createForm.password });
    setCreateForm(emptyCreate);
    toast.success('Staff account ban gaya.');
    load();
  }

  async function saveEdit(p) {
    const d = edits[p.id];
    setBusyId(p.id);
    const { error } = await supabase.rpc('admin_update_profile', { target_user: p.id, new_full_name: d.full_name, new_role: d.role, new_status: d.status });
    setBusyId('');
    if (error) return toast.error(friendlyError(error));
    setEdits((x) => { const n = { ...x }; delete n[p.id]; return n; });
    toast.success('Account update ho gaya.');
    load();
  }

  async function savePermissions(id) {
    setBusyId(id);
    const { error } = await supabase.rpc('admin_set_permissions', { target_user: id, perms: permDraftToJson(permDraft) });
    setBusyId('');
    if (error) return toast.error(friendlyError(error));
    setPermOpenId('');
    toast.success('Permissions save ho gayin — user ki screen par foran lagu.');
    load();
  }

  async function submitReset(id) {
    if (resetPassword.length < 8) return toast.error('Password kam az kam 8 characters ka ho.');
    setBusyId(id);
    const res = await callAdminFn({ action: 'reset_password', target_user: id, password: resetPassword });
    setBusyId('');
    if (res.error) return toast.error(res.error);
    window.alert(`Password reset ho gaya.\n\nNaya password: ${resetPassword}\n\nYeh staff member ko de dein — dobara nahi dikhega.`);
    setResetOpenId('');
  }

  async function deleteUser(p) {
    if (!window.confirm(`"${p.full_name || 'is user'}" ka login hamesha ke liye delete karein?\n\nUs ki banayi hui entries mehfooz rahengi. Sirf rokna ho to "Suspend" behtar hai.`)) return;
    setBusyId(p.id);
    const res = await callAdminFn({ action: 'delete', target_user: p.id });
    setBusyId('');
    if (res.error) return toast.error(res.error);
    toast.success('Account delete ho gaya.');
    load();
  }

  return (
    <>
      <Panel title="Naya Staff Account Banayein">
        <div className="note">Sirf Owner staff accounts banata hai. Naam, email, password aur role daal kar account foran ban jata hai — staff member usi password se login kar lega.</div>
        {createdCreds && (
          <div className="auth-ok">
            Account ban gaya — <b>{createdCreds.email}</b> / <b>{createdCreds.password}</b>. Yeh abhi note kar ke staff member ko de dein — dobara nahi dikhega.
          </div>
        )}
        <form onSubmit={submitCreate}>
          <div className="form-grid">
            <Field label="Poora naam"><input value={createForm.full_name} onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))} required /></Field>
            <Field label="Email (login)"><input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} required /></Field>
            <Field label="Password">
              <div className="pw-wrap">
                <input value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
                <button type="button" className="btn small" onClick={() => setCreateForm((f) => ({ ...f, password: generatePassword() }))}>Generate</button>
              </div>
            </Field>
            <Field label="Role">
              <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                {ASSIGNABLE_ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
          </div>
          <button type="submit" className="btn primary" disabled={createBusy}>{createBusy ? 'Please wait…' : 'Account Banayein'}</button>
        </form>
      </Panel>

      <Panel title="Staff Accounts">
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Naam</th><th>Email</th><th>Kab bana</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? <Empty colSpan={6} text="Loading…" /> : profiles.length ? profiles.map((p) => {
                const editing = edits[p.id];
                const self = p.id === user?.id;
                const overrides = Object.keys(p.permissions || {}).length;
                return (
                  <Fragment key={p.id}>
                    <tr>
                      {editing ? (
                        <>
                          <td><input value={editing.full_name} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], full_name: e.target.value } }))} /></td>
                          <td>{emails[p.id] || '—'}</td>
                          <td>{fmtDate(String(p.created_at || '').slice(0, 10))}</td>
                          <td>
                            <select value={editing.role} disabled={self} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], role: e.target.value } }))}>
                              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          </td>
                          <td>
                            <select value={editing.status} disabled={self} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], status: e.target.value } }))}>
                              <option value="active">Active</option><option value="suspended">Suspended</option>
                            </select>
                          </td>
                          <td className="row-actions">
                            <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => saveEdit(p)}>Save</button>
                            <button type="button" className="btn small" onClick={() => setEdits((x) => { const n = { ...x }; delete n[p.id]; return n; })}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{p.full_name || '(naam nahi)'} {self && <Badge kind="zero">Aap</Badge>}</td>
                          <td>{emails[p.id] || '—'}</td>
                          <td>{fmtDate(String(p.created_at || '').slice(0, 10))}</td>
                          <td>{ROLE_LABELS[p.role] || p.role}</td>
                          <td>{p.status === 'active' ? <Badge kind="neg">Active</Badge> : <Badge kind="bounced">Suspended</Badge>}</td>
                          <td>
                            <div className="row-actions">
                              <button type="button" className="btn small" onClick={() => setEdits((x) => ({ ...x, [p.id]: { full_name: p.full_name || '', role: p.role === 'pending' ? 'sales_staff' : p.role, status: p.status } }))}>Edit</button>
                              {p.role !== 'owner' && (
                                <>
                                  <button type="button" className="btn small" onClick={() => { setResetOpenId(''); if (permOpenId === p.id) { setPermOpenId(''); return; } setPermDraft(permDraftFrom(p)); setPermOpenId(p.id); }}>
                                    Permissions{overrides ? ` (${overrides})` : ''}
                                  </button>
                                  <button type="button" className="btn small" onClick={() => { setPermOpenId(''); setResetPassword(generatePassword()); setResetOpenId(resetOpenId === p.id ? '' : p.id); }}>Password</button>
                                  <button type="button" className="btn small danger" disabled={busyId === p.id} onClick={() => deleteUser(p)}>Delete</button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    {permOpenId === p.id && (
                      <tr>
                        <td colSpan={6}>
                          <div className="subpanel">
                            <div className="note">{p.full_name || 'Is user'} ke liye har module ki ijazat — role ke default se zyada ya kam. (Dekhna sab ko allowed hai; yeh sirf likhne/badalne ki ijazat hai.)</div>
                            <div className="form-grid">
                              {PERMISSION_MODULES.map((m) => (
                                <Field key={m} label={MODULE_LABELS[m]}>
                                  <select value={permDraft[m] || 'default'} onChange={(e) => setPermDraft((d) => ({ ...d, [m]: e.target.value }))}>
                                    <option value="default">Default ({(CAN_WRITE[m] || []).includes(p.role) ? 'Likh sakta' : 'Sirf dekh'})</option>
                                    <option value="allow">Allow (likh sakta)</option>
                                    <option value="deny">Deny (sirf dekh)</option>
                                  </select>
                                </Field>
                              ))}
                            </div>
                            <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => savePermissions(p.id)}>Permissions Save</button>{' '}
                            <button type="button" className="btn small" onClick={() => setPermOpenId('')}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {resetOpenId === p.id && (
                      <tr>
                        <td colSpan={6}>
                          <div className="subpanel">
                            <div className="note">{p.full_name || 'Is user'} ka naya password:</div>
                            <div className="pw-wrap" style={{ maxWidth: 380 }}>
                              <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={8} />
                              <button type="button" className="btn small" onClick={() => setResetPassword(generatePassword())}>Generate</button>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => submitReset(p.id)}>Password Reset Karein</button>{' '}
                              <button type="button" className="btn small" onClick={() => setResetOpenId('')}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : <Empty colSpan={6} text="Koi account nahi." />}
            </tbody>
          </table>
        </div>
        <div className="note">Owner apna role/status khud nahi badal sakta (warna app lock ho jaye). Kam az kam ek active Owner hamesha rehta hai. Owner apna password &quot;Mera Account&quot; se badalta hai.</div>
      </Panel>

      <Panel title="Permission Matrix (role defaults)">
        <div className="tablewrap">
          <table className="data compact">
            <thead><tr><th>Module</th>{ASSIGNABLE_ROLES.map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead>
            <tbody>
              {PERMISSION_MODULES.map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {ASSIGNABLE_ROLES.map((r) => <td key={r}>{r === 'owner' || (CAN_WRITE[m] || []).includes(r) ? <Badge kind="neg">Likh</Badge> : <Badge>Dekh</Badge>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
