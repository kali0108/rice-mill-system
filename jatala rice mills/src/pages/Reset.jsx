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
import { todayStr } from '../lib/dates';
import { T } from '../lib/i18n';

const MODES = [
  {
    value: 'carry_forward',
    title: T("Naya season — balances aage le jayein (recommended)"),
    body: T("Saari purani entries hat jayengi, lekin har party ka baqaya uski \"Opening Balance\" ban jayega, bacha hua stock \"Opening Stock\" aur Cash/Bank ka balance \"Opening Balance\" ban jayega. Parties ki list (phone wagaira) rahegi."),
  },
  {
    value: 'keep_parties',
    title: T("Sab hisaab saaf — sirf Parties ki list rakhein"),
    body: T("Saari entries aur balances zero. Parties ke naam/phone rahenge (opening balance zero)."),
  },
  {
    value: 'everything',
    title: T("Bilkul naya — sab kuch delete"),
    body: T("Saara business data aur Parties ki list bhi delete. (Mill Settings aur staff logins rahenge.)"),
  },
];

const PHRASE = 'RESET';
const DEL_PHRASE = 'DELETE';

const REGISTERS = [
  ['purchases', 'Paddy kharid'], ['sales', 'Sales / bills'], ['payments', 'Payments & cheques'], ['ledger_entries', 'Manual khata entries'],
  ['production_batches', 'Production'], ['drying_batches', 'Sukhai (drying)'], ['stock_adjustments', 'Stock adjustments'],
  ['stock_lots', 'Godown lots'], ['labor_entries', 'Mazdoori'], ['transport_entries', 'Transport'], ['machinery_log', 'Machinery log'],
  ['expenses', 'Kharche'], ['cash_entries', 'Cash book entries'], ['tax_records', 'Tax records'], ['zakat_assessments', 'Zakat'],
  ['contracts', 'Sauda / contracts'], ['weighments', 'Kanta slips'], ['bag_movements', 'Bardana'],
];

function DeleteRange() {
  const { user } = useAuth();
  const toast = useToast();
  const [picked, setPicked] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayStr());
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  async function run() {
    if (!picked.length) return toast.error(T("Kam az kam ek register chunein."));
    if (!from || !to || to < from) return toast.error(T("Sahi muddat (se / tak) chunein."));
    if (word !== DEL_PHRASE) return toast.error(`${T("Confirm ke liye ")}${DEL_PHRASE}${T(" likhein.")}`);
    if (!window.confirm(`${from}${T(" se ")}${to}${T(" tak ")}${picked.length}${T(" register(s) ka data hamesha ke liye delete hoga. Aage barhein?")}`)) return;
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (check.error) { setBusy(false); return toast.error(T("Owner password ghalat hai.")); }
    const { data, error } = await supabase.rpc('owner_delete_data', { p_tables: picked, p_from: from, p_to: to });
    setBusy(false);
    if (error) return toast.error(friendlyError(error));
    setResult(data);
    setWord('');
    setPassword('');
    picked.forEach((t) => emitLocalChange(t));
    emitLocalChange('*');
    toast.success(T("Chuna hua data delete ho gaya."));
  }

  return (
    <Panel title={T("Data delete karein (muddat aur register chunein)")}>
      <div className="note">{T("Poora reset kiye baghair, sirf chune hue registers ka ek muddat ka data mitayein — jaise ghalti se test entries, ya purane saal ka data. Kharid/sale/payment hatane se un ki khata entries khud hat jati hain. Lock wali muddat (Mill Settings) delete nahi hogi. Activity Log (audit) delete nahi hota.")}</div>
      <div className="check-grid">
        {REGISTERS.map(([k, label]) => (
          <label key={k} className="check"><input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} /> {label}</label>
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <Field label={T("Se (From)")}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={T("Tak (To)")}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={T("Owner password")}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <Field label={`${T("Confirm ke liye \"")}${DEL_PHRASE}${T("\" likhein")}`}><input value={word} onChange={(e) => setWord(e.target.value)} placeholder={DEL_PHRASE} /></Field>
      </div>
      <button type="button" className="btn danger-fill" disabled={busy || !picked.length || word !== DEL_PHRASE || !password} onClick={run}>
        {busy ? T("Delete ho raha hai…") : T("Chuna hua data Delete Karein")}
      </button>
      {result && (
        <div className="auth-ok" style={{ marginTop: 10 }}>{T("Delete ho gaya: ")}{Object.entries(result).map(([k, n]) => `${REGISTERS.find((r) => r[0] === k)?.[1] || k}: ${n}`).join(' · ')}
        </div>
      )}
    </Panel>
  );
}

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
    if (error) return toast.error(T("Password ghalat hai."));
    setVerified(true);
    setPassword('');
  }

  async function doReset() {
    const m = MODES.find((x) => x.value === mode);
    if (!window.confirm(`${T("AAKHRI WARNING\n\n")}${m.title}\n\n${m.body}${T("\n\nYeh wapas nahi ho sakta. Kya aap ne Backup le liya hai? Aage barhein?")}`)) return;
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
    toast.success(T("Reset mukammal."));
  }

  return (
    <>
    <DeleteRange />
    <Panel title={T("Reset / Naya Season")}>
      <div className="calcline" style={{ borderLeft: '3px solid var(--alert)' }}>{T("Yeh business data hamesha ke liye hata deta hai. Staff logins aur Mill Settings par asar nahi hota. ")}<b>{T("Pehle \"Backup / Import\" se Full Backup zaroor le lein.")}</b>
      </div>
      {done && <div className="auth-ok">{T("Ho gaya: ")}{done}{T(". Doosre devices par page refresh karein.")}</div>}

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
          <Field label={T("Owner password (tasdeeq ke liye)")}>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" style={{ maxWidth: 320 }} />
          </Field>
          <button type="submit" className="btn primary" disabled={busy} style={{ marginTop: 10 }}>{busy ? T("Check ho raha hai…") : T("Password Verify Karein")}</button>
        </form>
      ) : (
        <div>
          <Field label={`${T("Confirm ke liye \"")}${PHRASE}${T("\" likhein")}`}>
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder={PHRASE} style={{ maxWidth: 320 }} />
          </Field>
          <div className="form-actions">
            <button type="button" className="btn danger-fill" disabled={word !== PHRASE || busy} onClick={doReset}>{busy ? T("Ho raha hai…") : T("Reset Karein")}</button>
            <button type="button" className="btn" onClick={() => { setVerified(false); setWord(''); }}>{T("Cancel")}</button>
          </div>
        </div>
      )}
    </Panel>
    </>
  );
}
