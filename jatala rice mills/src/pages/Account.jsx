import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ROLE_LABELS, MODULE_LABELS, PERMISSION_MODULES, canWrite } from '../lib/roles';
import { friendlyError } from '../lib/errors';
import { Panel, Field, Badge } from '../components/ui';

export default function Account() {
  const { user, profile, reloadProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name || '');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);

  async function saveName(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user.id);
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    toast.success('Naam update ho gaya.');
    reloadProfile();
  }

  async function changePassword(e) {
    e.preventDefault();
    if (busy) return;
    if (pw.next.length < 8) return toast.error('Naya password kam az kam 8 characters ka ho.');
    if (pw.next !== pw.again) return toast.error('Naya password dono jagah ek jaisa likhein.');
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: pw.current });
    if (check.error) { setBusy(false); return toast.error('Mojooda password ghalat hai.'); }
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    setPw({ current: '', next: '', again: '' });
    toast.success('Password badal gaya.');
  }

  return (
    <>
      <Panel title="Mera Account">
        <div className="calcline">Email: <b>{user?.email}</b> · Role: <b>{ROLE_LABELS[profile?.role] || profile?.role}</b></div>
        <form onSubmit={saveName} className="filterbar">
          <Field label="Mera naam"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <button type="submit" className="btn" disabled={busy}>Naam Save</button>
        </form>
      </Panel>
      <Panel title="Password badlein">
        <form onSubmit={changePassword}>
          <div className="form-grid">
            <Field label="Mojooda password"><input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} required autoComplete="current-password" /></Field>
            <Field label="Naya password"><input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} required minLength={8} autoComplete="new-password" /></Field>
            <Field label="Naya password dobara"><input type="password" value={pw.again} onChange={(e) => setPw((p) => ({ ...p, again: e.target.value }))} required minLength={8} autoComplete="new-password" /></Field>
          </div>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Please wait…' : 'Password Badlein'}</button>
        </form>
      </Panel>
      <Panel title="Meri permissions">
        <div className="perm-list">
          {PERMISSION_MODULES.map((m) => (
            <span key={m} className="perm-item">{MODULE_LABELS[m]}: {canWrite(profile, m) ? <Badge kind="neg">Likh sakta</Badge> : <Badge>Sirf dekh</Badge>}</span>
          ))}
        </div>
      </Panel>
    </>
  );
}
