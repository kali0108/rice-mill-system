import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { friendlyError } from '../lib/errors';
import { clearLocalData } from '../lib/offline';
import { clearAllStores } from '../lib/tableStore';
import { clearAllRpcStores } from '../lib/rpcStore';
import { emitLocalChange } from '../lib/realtime';
import { Panel, Field } from '../components/ui';

const MODES = [
  {
    value: 'carry_forward',
    title: 'Naya season — balances aage le jayein (recommended)',
    body: 'Saari purani entries hat jayengi, lekin har party ka baqaya uski "Opening Balance" ban jayega, bacha hua stock "Opening Stock" aur Cash/Bank ka balance "Opening Balance" ban jayega. Parties ki list (phone wagaira) rahegi.',
  },
  {
    value: 'keep_parties',
    title: 'Sab hisaab saaf — sirf Parties ki list rakhein',
    body: 'Saari entries aur balances zero. Parties ke naam/phone rahenge (opening balance zero).',
  },
  {
    value: 'everything',
    title: 'Bilkul naya — sab kuch delete',
    body: 'Saara business data aur Parties ki list bhi delete. (Mill Settings aur staff logins rahenge.)',
  },
];

const PHRASE = 'RESET';

export default function Reset() {
  const { user } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('carry_forward');
  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState('');
  const [done, setDone] = useState('');

  async function verify(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    setBusy(false);
    if (error) return toast.error('Password ghalat hai.');
    setVerified(true);
    setPassword('');
  }

  async function doReset() {
    const m = MODES.find((x) => x.value === mode);
    if (!window.confirm(`AAKHRI WARNING\n\n${m.title}\n\n${m.body}\n\nYeh wapas nahi ho sakta. Kya aap ne Backup le liya hai? Aage barhein?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('owner_reset_all_data', { p_mode: mode });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    clearAllStores();
    clearAllRpcStores();
    await clearLocalData();
    emitLocalChange('*');
    setVerified(false);
    setWord('');
    setDone(m.title);
    toast.success('Reset mukammal.');
  }

  return (
    <Panel title="Reset / Naya Season">
      <div className="calcline" style={{ borderLeft: '3px solid var(--alert)' }}>
        Yeh business data hamesha ke liye hata deta hai. Staff logins aur Mill Settings par asar nahi hota. <b>Pehle &quot;Backup / Import&quot; se Full Backup zaroor le lein.</b>
      </div>
      {done && <div className="auth-ok">Ho gaya: {done}. Doosre devices par page refresh karein.</div>}

      <div className="mode-list">
        {MODES.map((m) => (
          <label key={m.value} className={`mode-card ${mode === m.value ? 'active' : ''}`}>
            <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
            <div><b>{m.title}</b><div className="note">{m.body}</div></div>
          </label>
        ))}
      </div>

      {!verified ? (
        <form onSubmit={verify}>
          <Field label="Owner password (tasdeeq ke liye)">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" style={{ maxWidth: 320 }} />
          </Field>
          <button type="submit" className="btn primary" disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Check ho raha hai…' : 'Password Verify Karein'}</button>
        </form>
      ) : (
        <div>
          <Field label={`Confirm ke liye "${PHRASE}" likhein`}>
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder={PHRASE} style={{ maxWidth: 320 }} />
          </Field>
          <div className="form-actions">
            <button type="button" className="btn danger-fill" disabled={word !== PHRASE || busy} onClick={doReset}>{busy ? 'Ho raha hai…' : 'Reset Karein'}</button>
            <button type="button" className="btn" onClick={() => { setVerified(false); setWord(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </Panel>
  );
}
