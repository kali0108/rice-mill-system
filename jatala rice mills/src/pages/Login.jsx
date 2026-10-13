import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errors';
import { T } from '../lib/i18n';
import Prefs from '../components/Prefs';

export default function Login() {
  const { session, signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ownerExists, setOwnerExists] = useState(null); // null = checking
  const [checkFailed, setCheckFailed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const checkOwner = useCallback(async () => {
    setCheckFailed(false);
    const { data, error: err } = await supabase.rpc('owner_exists');
    if (err) {
      setCheckFailed(true);
      setOwnerExists(true); // still allow signing in
      return;
    }
    setOwnerExists(!!data);
  }, []);

  useEffect(() => {
    checkOwner();
  }, [checkOwner]);

  if (session) return <Navigate to="/dashboard" replace />;

  async function handleSignIn(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.error) setError(friendlyError(result.error));
  }

  async function handleOwnerSignup(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    if (password.length < 8) { setError(T("Password kam az kam 8 characters ka rakhein.")); return; }
    if (password !== confirmPassword) { setError(T("Password aur Confirm Password ek jaise nahi hain.")); return; }
    setBusy(true);
    const result = await signUp(email, password, fullName);
    setBusy(false);
    if (result.error) { setError(friendlyError(result.error)); return; }
    if (!result.data?.session) {
      setNotice(T("Account ban gaya lekin Supabase email confirmation maang raha hai. Supabase → Authentication → \"Confirm email\" OFF karein, phir Sign In karein."));
      setOwnerExists(true);
    }
  }

  if (ownerExists === null) return <div className="boot-loading">{T("Loading…")}</div>;

  const pwField = (value, setter, label, autoComplete) => (
    <label className="field">
      <span className="lbl">{label}</span>
      <span className="pw-wrap">
        <input type={showPw ? 'text' : 'password'} value={value} onChange={(e) => setter(e.target.value)} required minLength={ownerExists ? undefined : 8} autoComplete={autoComplete} />
        <button type="button" className="btn small" onClick={() => setShowPw((s) => !s)}>{showPw ? T("Chupayein") : T("Dikhayein")}</button>
      </span>
    </label>
  );

  return (
    <div className="auth-wrap">
      <Prefs className="login-prefs" />
      <div className="auth-card">
        <div className="mark">{T("Jatala Rice Mills")}</div>
        <div className="sub">{T("Rice Mill Manager")}</div>
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-ok">{notice}</div>}
        {checkFailed && (
          <div className="auth-error">{T("Server se rabta nahi ho saka. Internet check karein.")}{' '}
            <button type="button" className="linkbtn" onClick={checkOwner}>{T("Dobara koshish")}</button>
          </div>
        )}

        {!ownerExists ? (
          <>
            <div className="calcline">{T("Yeh mill ka ")}<b>{T("pehla account")}</b>{T(" hai — is se ")}<b>{T("Owner")}</b>{T(" account banega jise poori app ki access hogi. Baqi staff (Munshi, Godown Incharge, Sales Staff) ke accounts baad mein Owner khud \"Users & Roles\" se banayega.")}</div>
            <form onSubmit={handleOwnerSignup}>
              <label className="field"><span className="lbl">{T("Poora Naam")}</span><input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" /></label>
              <label className="field"><span className="lbl">{T("Email")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
              {pwField(password, setPassword, 'Password (kam az kam 8)', 'new-password')}
              {pwField(confirmPassword, setConfirmPassword, 'Password dobara', 'new-password')}
              <button className="btn primary" type="submit" disabled={busy}>{busy ? T("Please wait…") : T("Owner Account Banayein")}</button>
            </form>
          </>
        ) : (
          <form onSubmit={handleSignIn}>
            <label className="field"><span className="lbl">{T("Email")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
            {pwField(password, setPassword, 'Password', 'current-password')}
            <button className="btn primary" type="submit" disabled={busy}>{busy ? T("Please wait…") : T("Sign In")}</button>
          </form>
        )}

        <div className="switch">
          <button type="button" className="linkbtn" onClick={() => setShowHelp((s) => !s)}>{T("Password bhool gaye / naya account?")}</button>
          {showHelp && (
            <div className="note" style={{ textAlign: 'left', marginTop: 8 }}>
              <b>{T("Staff:")}</b>{T(" Owner se kahein — wo \"Users & Roles\" page se aap ka naya password set kar dega ya naya account bana dega.")}<br />
              <b>{T("Owner:")}</b>{T(" Supabase Dashboard → Authentication → Users → apna email → \"Send password recovery\" ya naya password set karein.")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
