import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ownerExists, setOwnerExists] = useState(null); // null = still checking

  useEffect(() => {
    supabase.rpc('owner_exists').then(({ data, error }) => {
      if (!error) setOwnerExists(!!data);
    });
  }, []);

  if (session) return <Navigate to="/dashboard" replace />;

  // Sign Up is ONLY for creating the very first Owner account. Once an Owner
  // exists, every other account is created by the Owner from the Users page
  // (with a password the Owner sets), not through this form.
  const showSignup = ownerExists === false;

  async function handleSignIn(e) {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.error) setError(result.error.message);
  }

  async function handleOwnerSignup(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (password !== confirmPassword) { setError('Password aur Confirm Password match nahi kar rahe.'); return; }
    setBusy(true);
    const result = await signUp(email, password, fullName);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (!result.data?.session) {
      setNotice('Owner account ban gaya hai. Confirmation email bheja gaya hai — apna inbox check karein, link par click karein, phir Sign In karein.');
    }
  }

  if (ownerExists === null) {
    return <div className="boot-loading">Loading…</div>;
  }

  if (showSignup) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="mark">Kanta Khata</div>
          <div className="sub">Rice Mill Manager</div>
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          {notice && <div className="auth-ok" style={{ marginBottom: 12 }}>{notice}</div>}

          <div className="calcline" style={{ marginBottom: 14 }}>
            Yeh mill ka <b>pehla account</b> hai — is se secure <b>Owner</b> account banega jise poori app ki access hogi.
            Baki sab staff accounts (Munshi, Godown Incharge, Sales Staff) sirf Owner hi baad mein "Users &amp; Roles" page se banayega —
            koi aur khud sign up nahi kar sakta.
          </div>

          <form onSubmit={handleOwnerSignup}>
            <div className="field"><label>Full Name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
            <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
            <div className="field"><label>Confirm Password</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} /></div>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Create Owner Account'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="mark">Kanta Khata</div>
        <div className="sub">Rice Mill Manager</div>
        {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleSignIn}>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Sign In'}</button>
        </form>
        <div className="switch">Naya account chahiye? Apne Owner/Admin se rabta karein — wo aapke liye account bana denge.</div>
      </div>
    </div>
  );
}
