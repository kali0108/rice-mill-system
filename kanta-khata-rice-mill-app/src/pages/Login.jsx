import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, fullName);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (mode === 'signup') {
      if (result.data?.session) {
        // Email confirmation is off on this project — signed in immediately.
      } else {
        setNotice('Account ban gaya hai. Confirmation email bheja gaya hai — apna inbox check karein, link par click karein, phir Sign In karein.');
        setMode('signin');
      }
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="mark">Kanta Khata</div>
        <div className="sub">Rice Mill Manager</div>
        {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
        {notice && <div className="auth-ok" style={{ marginBottom: 12 }}>{notice}</div>}

        {mode === 'signup' && ownerExists === false && (
          <div className="calcline" style={{ marginBottom: 14 }}>
            Yeh mill ka <b>pehla account</b> hai — is se <b>Owner</b> account banega jise poori app ki access hogi.
          </div>
        )}
        {mode === 'signup' && ownerExists === true && (
          <div className="calcline" style={{ marginBottom: 14 }}>
            Agar Owner ne aapko invite kiya hai to sign up karte hi aapka sahi role mil jayega.
            Warna account "Pending Approval" mein rahega jab tak Owner aapko approve na kare.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field">
              <label>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <div className="switch">
          {mode === 'signin' ? (
            <>Naya staff account chahiye? <a onClick={() => setMode('signup')}>Sign Up</a></>
          ) : (
            <>Pehle se account hai? <a onClick={() => setMode('signin')}>Sign In</a></>
          )}
        </div>
      </div>
    </div>
  );
}
