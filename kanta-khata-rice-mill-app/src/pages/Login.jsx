import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, fullName);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (mode === 'signup') {
      if (result.data?.session) {
        // Email confirmation is off — signed in immediately.
      } else {
        setNotice('Account ban gaya. Agar email confirmation on hai to apna inbox check karein, phir sign in karein.');
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
        <div className="note" style={{ textAlign: 'center', marginTop: 10 }}>
          Sab se pehla account khud-ba-khud <b>Owner</b> ban jata hai. Baad ke accounts Owner "Users &amp; Roles" mein role set karega.
        </div>
      </div>
    </div>
  );
}
