import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Panel } from '../components/ui';

const CONFIRM_PHRASE = 'RESET';

export default function Reset() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [done, setDone] = useState(false);

  async function verifyPassword(e) {
    e.preventDefault();
    setVerifyError('');
    setVerifying(true);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    setVerifying(false);
    if (error) { setVerifyError('Password ghalat hai.'); return; }
    setVerified(true);
    setPassword('');
  }

  async function doReset() {
    const sure = window.confirm(
      'Yeh FINAL warning hai.\n\nSaara business data (purchases, ledger, production, stock, sales, payments, labor, transport, machinery, expenses, tax, zakat, activity log) hamesha ke liye delete ho jayega. Staff accounts aur logins mahfooz rahenge.\n\nYeh action wapas nahi ho sakta. Aage badhein?'
    );
    if (!sure) return;
    setResetError('');
    setResetting(true);
    const { error } = await supabase.rpc('owner_reset_all_data');
    setResetting(false);
    if (error) { setResetError(error.message); return; }
    setDone(true);
    setVerified(false);
    setConfirmText('');
  }

  return (
    <Panel title="Reset Data — Website Naya Kar Dein">
      <div className="calcline" style={{ marginBottom: 18, borderLeft: '3px solid var(--alert)' }}>
        Yeh saara business data (har module) hamesha ke liye delete kar deta hai — jese website bilkul nayi ho.
        Staff accounts aur logins is se affected nahi hotay. <b>Yeh wapas nahi ho sakta</b> — pehle Import/Export page se
        Full Backup zaroor le lein agar future mein data chahiye ho.
      </div>

      {done && (
        <div className="auth-ok" style={{ marginBottom: 16 }}>
          Reset ho gaya — sara business data delete ho chuka hai. App ab bilkul nayi state mein hai.
        </div>
      )}

      {!verified ? (
        <form onSubmit={verifyPassword}>
          <div className="note" style={{ marginBottom: 10 }}>Aage badhne ke liye apna Owner account password dobara enter karein.</div>
          {verifyError && <div className="auth-error" style={{ marginBottom: 12 }}>{verifyError}</div>}
          <div className="field" style={{ maxWidth: 320, marginBottom: 14 }}>
            <label>Owner Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn primary" type="submit" disabled={verifying}>{verifying ? 'Checking…' : 'Password Verify Karein'}</button>
        </form>
      ) : (
        <div>
          <div className="note" style={{ marginBottom: 10 }}>
            Password verify ho gaya. Confirm karne ke liye neeche box mein <b>{CONFIRM_PHRASE}</b> type karein.
          </div>
          {resetError && <div className="auth-error" style={{ marginBottom: 12 }}>{resetError}</div>}
          <div className="field" style={{ maxWidth: 320, marginBottom: 14 }}>
            <label>Type "{CONFIRM_PHRASE}" to confirm</label>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={CONFIRM_PHRASE} />
          </div>
          <button
            className="btn"
            style={{ background: 'var(--alert)', color: '#fff', borderColor: 'var(--alert)', opacity: confirmText !== CONFIRM_PHRASE || resetting ? 0.5 : 1 }}
            disabled={confirmText !== CONFIRM_PHRASE || resetting}
            onClick={doReset}
          >
            {resetting ? 'Resetting…' : 'Sab Data Permanently Delete Karein'}
          </button>{' '}
          <button className="btn small" onClick={() => { setVerified(false); setConfirmText(''); }}>Cancel</button>
        </div>
      )}
    </Panel>
  );
}
