import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  ROLE_LABELS, MODULE_LABELS, PERMISSION_MODULES, ACTIONS, ACTION_LABELS, roleDefault, assignableRoles,
} from '../lib/roles';
import { fmtDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { Panel, Badge, Empty, Field } from '../components/ui';
import { T } from '../lib/i18n';

const emptyCreate = { full_name: '', email: '', password: '', role: 'munshi' };

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

// effective grid {module: {view, add, edit, delete}} from stored overrides + role defaults
function gridFrom(p) {
  const o = p.permissions || {};
  const g = {};
  PERMISSION_MODULES.forEach((m) => {
    g[m] = {};
    ACTIONS.forEach((a) => {
      const v = o[m];
      let val = roleDefault(p.role, m, a);
      if (typeof v === 'boolean') val = a === 'view' ? val || v : v;
      else if (v && typeof v === 'object' && typeof v[a] === 'boolean') val = v[a];
      g[m][a] = val;
    });
  });
  return g;
}

// store only what differs from the role default
function overridesFrom(role, grid) {
  const out = {};
  PERMISSION_MODULES.forEach((m) => {
    ACTIONS.forEach((a) => {
      if (grid[m][a] !== roleDefault(role, m, a)) {
        out[m] = out[m] || {};
        out[m][a] = grid[m][a];
      }
    });
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
  const { user, profile: me } = useAuth();
  const toast = useToast();
  const iAmOwner = me?.role === 'owner';
  const [profiles, setProfiles] = useState([]);
  const [emails, setEmails] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createBusy, setCreateBusy] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [edits, setEdits] = useState({});
  const [permOpenId, setPermOpenId] = useState('');
  const [grid, setGrid] = useState(null);
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

  // Owner manages everyone (except locking himself out); Manager only staff below him
  const canManage = (p) => p.id !== user?.id && (iAmOwner ? true : !['owner', 'manager'].includes(p.role));

  async function submitCreate(e) {
    e.preventDefault();
    if (createBusy) return;
    setCreatedCreds(null);
    if (createForm.password.length < 8) return toast.error(T("Password kam az kam 8 characters ka ho."));
    setCreateBusy(true);
    const res = await callAdminFn({ action: 'create', email: createForm.email.trim(), password: createForm.password, full_name: createForm.full_name.trim(), role: createForm.role });
    setCreateBusy(false);
    if (res.error) return toast.error(res.error);
    setCreatedCreds({ email: createForm.email.trim(), password: createForm.password });
    setCreateForm(emptyCreate);
    toast.success(T("Staff account ban gaya."));
    load();
  }

  async function saveEdit(p) {
    const d = edits[p.id];
    setBusyId(p.id);
    const { error } = await supabase.rpc('admin_update_profile', { target_user: p.id, new_full_name: d.full_name, new_role: d.role, new_status: d.status });
    setBusyId('');
    if (error) return toast.error(friendlyError(error));
    setEdits((x) => { const n = { ...x }; delete n[p.id]; return n; });
    toast.success(T("Account update ho gaya."));
    load();
  }

  async function savePermissions(p, reset) {
    setBusyId(p.id);
    const perms = reset ? {} : overridesFrom(p.role, grid);
    const { error } = await supabase.rpc('admin_set_permissions', { target_user: p.id, perms });
    setBusyId('');
    if (error) return toast.error(friendlyError(error));
    setPermOpenId('');
    toast.success(reset ? T("Role ki default permissions wapas lag gayin.") : T("Permissions save ho gayin — user ki screen par foran lagu."));
    load();
  }

  function toggle(m, a) {
    setGrid((g) => {
      const row = { ...g[m], [a]: !g[m][a] };
      if (a !== 'view' && row[a]) row.view = true;          // writing needs viewing
      if (a === 'view' && !row.view) { row.add = false; row.edit = false; row.delete = false; }
      return { ...g, [m]: row };
    });
  }

  async function submitReset(id) {
    if (resetPassword.length < 8) return toast.error(T("Password kam az kam 8 characters ka ho."));
    setBusyId(id);
    const res = await callAdminFn({ action: 'reset_password', target_user: id, password: resetPassword });
    setBusyId('');
    if (res.error) return toast.error(res.error);
    window.alert(`${T("Password reset ho gaya.\n\nNaya password: ")}${resetPassword}${T("\n\nYeh staff member ko de dein — dobara nahi dikhega.")}`);
    setResetOpenId('');
  }

  async function deleteUser(p) {
    if (!window.confirm(`"${p.full_name || T("is user")}${T("\" ka login hamesha ke liye delete karein?\n\nUs ki banayi hui entries mehfooz rahengi. Sirf rokna ho to \"Suspend\" behtar hai.")}`)) return;
    setBusyId(p.id);
    const res = await callAdminFn({ action: 'delete', target_user: p.id });
    setBusyId('');
    if (res.error) return toast.error(res.error);
    toast.success(T("Account delete ho gaya."));
    load();
  }

  const roleChoices = assignableRoles(me?.role);

  return (
    <>
      <Panel title={T("Naya Staff Account Banayein")}>
        <div className="note">
          {iAmOwner ? T("Owner har qisam ka account bana sakta hai (Manager samet).") : T("Manager sirf Munshi, Godown Incharge aur Sales Staff ke accounts bana sakta hai.")}{' '}{T("Account foran ban jata hai — staff member usi email/password se login kar lega.")}</div>
        {createdCreds && (
          <div className="auth-ok">{T("Account ban gaya — ")}<b>{createdCreds.email}</b> / <b>{createdCreds.password}</b>{T(". Yeh abhi note kar ke staff member ko de dein — dobara nahi dikhega.")}</div>
        )}
        <form onSubmit={submitCreate}>
          <div className="form-grid">
            <Field label={T("Poora naam")}><input value={createForm.full_name} onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))} required /></Field>
            <Field label={T("Email (login)")}><input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} required /></Field>
            <Field label={T("Password")}>
              <div className="pw-wrap">
                <input value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
                <button type="button" className="btn small" onClick={() => setCreateForm((f) => ({ ...f, password: generatePassword() }))}>{T("Generate")}</button>
              </div>
            </Field>
            <Field label={T("Role")}>
              <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                {roleChoices.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
          </div>
          <button type="submit" className="btn primary" disabled={createBusy}>{createBusy ? T("Please wait…") : T("Account Banayein")}</button>
        </form>
      </Panel>

      <Panel title={T("Staff Accounts")}>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>{T("Naam")}</th><th>{T("Email")}</th><th>{T("Kab bana")}</th><th>{T("Role")}</th><th>{T("Status")}</th><th></th></tr></thead>
            <tbody>
              {loading ? <Empty colSpan={6} text={T("Loading…")} /> : profiles.length ? profiles.map((p) => {
                const editing = edits[p.id];
                const self = p.id === user?.id;
                const manageable = canManage(p);
                const overrides = Object.keys(p.permissions || {}).length;
                return (
                  <Fragment key={p.id}>
                    <tr>
                      {editing ? (
                        <>
                          <td><input value={editing.full_name} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], full_name: e.target.value } }))} aria-label={T("Naam")} /></td>
                          <td>{emails[p.id] || '—'}</td>
                          <td>{fmtDate(String(p.created_at || '').slice(0, 10))}</td>
                          <td>
                            <select value={editing.role} disabled={self} aria-label={T("Role")} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], role: e.target.value } }))}>
                              {[...new Set([...roleChoices, editing.role])].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                          </td>
                          <td>
                            <select value={editing.status} disabled={self} aria-label={T("Status")} onChange={(e) => setEdits((x) => ({ ...x, [p.id]: { ...x[p.id], status: e.target.value } }))}>
                              <option value="active">{T("Active")}</option><option value="suspended">{T("Suspended")}</option>
                            </select>
                          </td>
                          <td className="row-actions">
                            <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => saveEdit(p)}>{T("Save")}</button>
                            <button type="button" className="btn small" onClick={() => setEdits((x) => { const n = { ...x }; delete n[p.id]; return n; })}>{T("Cancel")}</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{p.full_name || T("(naam nahi)")} {self && <Badge kind="zero">{T("Aap")}</Badge>}</td>
                          <td>{emails[p.id] || '—'}</td>
                          <td>{fmtDate(String(p.created_at || '').slice(0, 10))}</td>
                          <td>{ROLE_LABELS[p.role] || p.role}{overrides ? <div className="muted">{T("Custom permissions")}</div> : null}</td>
                          <td>{p.status === 'active' ? <Badge kind="neg">{T("Active")}</Badge> : <Badge kind="bounced">{T("Suspended")}</Badge>}</td>
                          <td>
                            <div className="row-actions">
                              {(manageable || self) && (
                                <button type="button" className="btn small" onClick={() => setEdits((x) => ({ ...x, [p.id]: { full_name: p.full_name || '', role: p.role === 'pending' ? 'sales_staff' : p.role, status: p.status } }))}>{T("Edit")}</button>
                              )}
                              {manageable && p.role !== 'owner' && (
                                <>
                                  <button type="button" className="btn small" onClick={() => { setResetOpenId(''); if (permOpenId === p.id) { setPermOpenId(''); return; } setGrid(gridFrom(p)); setPermOpenId(p.id); }}>{T("Permissions")}{overrides ? ` (${overrides})` : ''}
                                  </button>
                                  <button type="button" className="btn small" onClick={() => { setPermOpenId(''); setResetPassword(generatePassword()); setResetOpenId(resetOpenId === p.id ? '' : p.id); }}>{T("Password")}</button>
                                  <button type="button" className="btn small danger" disabled={busyId === p.id} onClick={() => deleteUser(p)}>{T("Delete")}</button>
                                </>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    {permOpenId === p.id && grid && (
                      <tr>
                        <td colSpan={6}>
                          <div className="subpanel">
                            <div className="note">
                              <b>{p.full_name || T("Is user")}</b> ({ROLE_LABELS[p.role]}{T(") — har module mein kya kar sakta hai. Halki (italic) ijazat role ki default hai; badalne ke baad woh is user ke liye custom ho jati hai. Likhne (Naya/Badalna/Delete) ke liye Dekhna khud on ho jata hai.")}</div>
                            <div className="tablewrap">
                              <table className="data compact perm-grid">
                                <thead><tr><th>{T("Module")}</th>{ACTIONS.map((a) => <th key={a}>{ACTION_LABELS[a]}</th>)}</tr></thead>
                                <tbody>
                                  {PERMISSION_MODULES.map((m) => (
                                    <tr key={m}>
                                      <td>{MODULE_LABELS[m]}</td>
                                      {ACTIONS.map((a) => {
                                        const isDefault = grid[m][a] === roleDefault(p.role, m, a);
                                        return (
                                          <td key={a} className={isDefault ? 'perm-default' : 'perm-custom'}>
                                            <label className="check">
                                              <input type="checkbox" checked={grid[m][a]} onChange={() => toggle(m, a)} aria-label={`${MODULE_LABELS[m]} ${ACTION_LABELS[a]}`} />
                                            </label>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="form-actions">
                              <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => savePermissions(p, false)}>{T("Permissions Save")}</button>
                              <button type="button" className="btn small" disabled={busyId === p.id} onClick={() => savePermissions(p, true)}>{T("Role default par wapas")}</button>
                              <button type="button" className="btn small" onClick={() => setPermOpenId('')}>{T("Cancel")}</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {resetOpenId === p.id && (
                      <tr>
                        <td colSpan={6}>
                          <div className="subpanel">
                            <div className="note">{p.full_name || T("Is user")}{T(" ka naya password:")}</div>
                            <div className="pw-wrap" style={{ maxWidth: 380 }}>
                              <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={8} aria-label={T("Naya password")} />
                              <button type="button" className="btn small" onClick={() => setResetPassword(generatePassword())}>{T("Generate")}</button>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <button type="button" className="btn small primary" disabled={busyId === p.id} onClick={() => submitReset(p.id)}>{T("Password Reset Karein")}</button>{' '}
                              <button type="button" className="btn small" onClick={() => setResetOpenId('')}>{T("Cancel")}</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              }) : <Empty colSpan={6} text={T("Koi account nahi.")} />}
            </tbody>
          </table>
        </div>
        <div className="note">{T("Koi apna khud ka role/status nahi badal sakta. Kam az kam ek active Owner hamesha rehta hai. Sirf Owner kisi ko Owner/Manager bana sakta hai, aur Manager ki permissions sirf Owner badal sakta hai. Apna password \"Mera Account\" se badlein.")}</div>
      </Panel>

      <Panel title={T("Role ki default permissions")}>
        <div className="tablewrap">
          <table className="data compact">
            <thead><tr><th>{T("Module")}</th>{['owner', 'manager', 'munshi', 'godown_incharge', 'sales_staff'].map((r) => <th key={r}>{ROLE_LABELS[r]}</th>)}</tr></thead>
            <tbody>
              {PERMISSION_MODULES.map((m) => (
                <tr key={m}>
                  <td>{MODULE_LABELS[m]}</td>
                  {['owner', 'manager', 'munshi', 'godown_incharge', 'sales_staff'].map((r) => (
                    <td key={r}>{roleDefault(r, m, 'add') ? <Badge kind="neg">{T("Sab kuch")}</Badge> : <Badge>{T("Sirf dekhna")}</Badge>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
