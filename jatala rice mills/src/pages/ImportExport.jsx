import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { fetchAll } from '../lib/fetchAll';
import { TABLES, BACKUP_TABLES } from '../lib/schema';
import { exportCSV, downloadFile } from '../lib/csv';
import { parseCSV, coerceImportRow } from '../lib/csvImport';
import { emitLocalChange } from '../lib/realtime';
import { todayStr } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { clearLocalData } from '../lib/offline';
import { clearAllStores } from '../lib/tableStore';
import { clearAllRpcStores } from '../lib/rpcStore';
import { Panel, Badge, Field } from '../components/ui';

async function readTable(table) {
  const orderCol = table === 'settings' ? 'id' : 'created_at';
  return fetchAll((withCount) => supabase.from(table).select('*', withCount ? { count: 'exact' } : undefined).order(orderCol, { ascending: true }).order('id', { ascending: true }));
}

function ModuleRow({ table, onStatus }) {
  const def = TABLES[table];
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  async function handleExport() {
    setBusy(true);
    const { data, error } = await readTable(table);
    setBusy(false);
    if (error) return onStatus(table, 'error', friendlyError(error));
    if (!data.length) return onStatus(table, 'info', 'Is module mein koi data nahi.');
    const headers = Object.keys(def.cols);
    exportCSV(`${table}_${todayStr()}.csv`, headers, data.map((r) => headers.map((h) => r[h])));
    onStatus(table, 'ok', `${data.length} rows export ho gayin.`);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCSV(await file.text());
      const rows = [];
      const errors = [];
      let skipped = 0;
      parsed.forEach((raw, i) => {
        const res = coerceImportRow(def, raw, table);
        if (res.skip) skipped++;
        else if (res.error) errors.push(`Row ${i + 2}: ${res.error}`);
        else rows.push(res.row);
      });
      setPreview({ name: file.name, rows, errors, skipped });
    } catch (err) {
      onStatus(table, 'error', 'File parh nahi saki: ' + (err.message || err));
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function doImport() {
    const { rows } = preview;
    setBusy(true);
    let done = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from(table).insert(chunk);
      if (error) {
        setBusy(false);
        setPreview(null);
        emitLocalChange(table);
        return onStatus(table, 'error', `${done} rows import huin, phir row ${i + 2} ke aas paas ghalti: ${friendlyError(error)}`);
      }
      done += chunk.length;
    }
    setBusy(false);
    setPreview(null);
    emitLocalChange(table);
    emitLocalChange('*');
    onStatus(table, 'ok', `${done} nayi rows import ho gayin.`);
  }

  return (
    <>
      <tr>
        <td>{def.label}</td>
        <td><button type="button" className="btn small" disabled={busy} onClick={handleExport}>Export CSV</button></td>
        <td><input ref={fileRef} type="file" accept=".csv,text/csv" disabled={busy} onChange={handleFile} /></td>
      </tr>
      {preview && (
        <tr>
          <td colSpan={3}>
            <div className="subpanel">
              <b>{preview.name}</b>: {preview.rows.length} rows import ke liye tayyar
              {preview.skipped ? ` · ${preview.skipped} auto khata rows chhor di gayin (woh asal entries se khud bante hain)` : ''}
              {preview.errors.length ? <div className="auth-error">{preview.errors.slice(0, 8).map((x) => <div key={x}>{x}</div>)}{preview.errors.length > 8 ? <div>… aur {preview.errors.length - 8}</div> : null}</div> : null}
              <div className="note">Import hamesha <b>nayi</b> entries banata hai — purani ko overwrite nahi karta. Pehle se maujood rows dobara import na karein.</div>
              <button type="button" className="btn small primary" disabled={busy || !preview.rows.length || preview.errors.length > 0} onClick={doImport}>
                {busy ? 'Import ho raha hai…' : `${preview.rows.length} rows Import Karein`}
              </button>{' '}
              <button type="button" className="btn small" onClick={() => setPreview(null)}>Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ImportExport() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState({});
  const [backupBusy, setBackupBusy] = useState(false);
  const [restore, setRestore] = useState(null); // { name, data, counts }
  const [restorePw, setRestorePw] = useState('');
  const [restoreWord, setRestoreWord] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const restoreRef = useRef(null);
  const onStatus = (t, kind, message) => setStatus((s) => ({ ...s, [t]: { kind, message } }));

  async function downloadBackup() {
    setBackupBusy(true);
    const backup = { kanta_khata_backup: 5, exported_at: new Date().toISOString() };
    for (const t of BACKUP_TABLES) {
      const { data, error } = await readTable(t);
      if (error) {
        setBackupBusy(false);
        return toast.error(`Backup adhoora — ${t}: ${friendlyError(error)}`);
      }
      backup[t] = data;
    }
    setBackupBusy(false);
    downloadFile(`kanta-khata-backup-${todayStr()}.json`, JSON.stringify(backup), 'application/json');
    const total = BACKUP_TABLES.reduce((s, t) => s + (backup[t]?.length || 0), 0);
    toast.success(`Backup download ho gaya (${total} rows).`);
  }

  async function chooseRestore(e) {
    const file = e.target.files?.[0];
    if (restoreRef.current) restoreRef.current.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || (!Array.isArray(data.purchases) && !Array.isArray(data.ledger_entries))) {
        return toast.error('Yeh Kanta Khata ki backup file nahi lagti.');
      }
      const counts = Object.fromEntries(BACKUP_TABLES.filter((t) => Array.isArray(data[t])).map((t) => [t, data[t].length]));
      setRestore({ name: file.name, data, counts, exportedAt: data.exported_at });
    } catch {
      toast.error('File parh nahi saki — yeh sahi JSON backup nahi.');
    }
  }

  async function doRestore() {
    if (restoreWord !== 'RESTORE') return toast.error('Confirm ke liye RESTORE likhein.');
    if (!window.confirm('Aakhri tasdeeq: mojooda saara business data hata kar backup wala data daal diya jayega. Aage barhein?')) return;
    setRestoreBusy(true);
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: restorePw });
    if (check.error) {
      setRestoreBusy(false);
      return toast.error('Owner password ghalat hai.');
    }
    const { data, error } = await supabase.rpc('owner_restore_backup', { p_data: restore.data });
    setRestoreBusy(false);
    if (error) return toast.error('Restore nahi hua: ' + friendlyError(error));
    clearAllStores();
    clearAllRpcStores();
    await clearLocalData();
    emitLocalChange('*');
    setRestore(null);
    setRestorePw('');
    setRestoreWord('');
    toast.success('Backup restore ho gaya: ' + Object.entries(data || {}).map(([k, v]) => `${k} ${v}`).join(', '));
    setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <>
      <Panel title="Full Backup (JSON)">
        <div className="note">Ek click mein har module ka poora data (Settings aur Parties samet) ek file mein. Har hafte ek backup Google Drive / USB par rakhein.</div>
        <button type="button" className="btn primary" disabled={backupBusy} onClick={downloadBackup}>{backupBusy ? 'Tayyar ho raha hai…' : 'Full Backup Download'}</button>
      </Panel>

      <Panel title="Backup se Restore">
        <div className="calcline" style={{ borderLeft: '3px solid var(--alert)' }}>
          Restore se <b>mojooda saara business data hat jayega</b> aur backup wala data aa jayega (logins wese hi rahenge). Pehle mojooda data ka backup zaroor le lein.
        </div>
        {!restore ? (
          <input ref={restoreRef} type="file" accept=".json,application/json" onChange={chooseRestore} />
        ) : (
          <div className="subpanel">
            <div><b>{restore.name}</b>{restore.exportedAt ? ` — ${new Date(restore.exportedAt).toLocaleString()}` : ''}</div>
            <div className="mini-stats">{Object.entries(restore.counts).map(([t, n]) => <span key={t}>{TABLES[t]?.label || t}: {n}</span>)}</div>
            <div className="form-grid">
              <Field label="Owner password"><input type="password" value={restorePw} onChange={(e) => setRestorePw(e.target.value)} autoComplete="current-password" /></Field>
              <Field label='Confirm ke liye "RESTORE" likhein'><input value={restoreWord} onChange={(e) => setRestoreWord(e.target.value)} placeholder="RESTORE" /></Field>
            </div>
            <button type="button" className="btn danger-fill" disabled={restoreBusy || restoreWord !== 'RESTORE' || !restorePw} onClick={doRestore}>
              {restoreBusy ? 'Restore ho raha hai…' : 'Restore Karein'}
            </button>{' '}
            <button type="button" className="btn" onClick={() => setRestore(null)}>Cancel</button>
          </div>
        )}
      </Panel>

      <Panel title="Module-wise CSV (Excel)">
        <div className="note">
          <b>Export</b> se module ka saara data CSV mein (Excel mein khulta hai, Urdu naam samet). <b>Import</b> ke liye wahi columns istemal karein
          (pehle Export kar ke dekh lein). Tareekh YYYY-MM-DD ya DD/MM/YYYY. Hisaab wale columns (raqam, net weight wagaira) database khud dobara nikalta hai.
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Module</th><th>Export</th><th>Import (CSV)</th></tr></thead>
            <tbody>{Object.keys(TABLES).map((t) => <ModuleRow key={t} table={t} onStatus={onStatus} />)}</tbody>
          </table>
        </div>
        {Object.keys(status).length > 0 && (
          <div className="alertlist" style={{ marginTop: 12 }}>
            {Object.entries(status).map(([t, s]) => (
              <div className="alertrow" key={t}>
                <span>{TABLES[t]?.label || t}: {s.message}</span>
                {s.kind === 'ok' ? <Badge kind="neg">Done</Badge> : s.kind === 'error' ? <Badge kind="bounced">Error</Badge> : <Badge>Info</Badge>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
