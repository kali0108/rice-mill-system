import { useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { MODULE_LABELS, PERMISSION_MODULES } from '../lib/roles';
import { exportCSV } from '../lib/csv';
import { parseCSV, coerceRow } from '../lib/csvImport';
import { Panel, Badge } from '../components/ui';

const TABLES = {
  purchase: 'purchases', ledger: 'ledger_entries', production: 'production_batches', stock: 'stock_lots',
  sales: 'sales', payments: 'payments', labor: 'labor_entries', transport: 'transport_entries',
  machinery: 'machinery_log', expenses: 'expenses', tax: 'tax_records', zakat: 'zakat_assessments',
};

function ModuleRow({ moduleKey, onStatus }) {
  const table = TABLES[moduleKey];
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    const { data, error } = await supabase.from(table).select('*');
    setBusy(false);
    if (error) { onStatus(moduleKey, 'error', error.message); return; }
    if (!data || !data.length) { onStatus(moduleKey, 'info', 'Is module mein koi data nahi hai export karne ke liye.'); return; }
    const headers = Object.keys(data[0]);
    exportCSV(`${table}.csv`, headers, data.map((r) => headers.map((h) => r[h])));
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCSV(text).map(coerceRow);
      if (!parsed.length) { onStatus(moduleKey, 'error', 'File mein koi valid row nahi mili.'); setBusy(false); return; }
      const { error, count } = await supabase.from(table).insert(parsed, { count: 'exact' });
      if (error) onStatus(moduleKey, 'error', error.message);
      else onStatus(moduleKey, 'ok', `${count ?? parsed.length} rows import ho gayi.`);
    } catch (err) {
      onStatus(moduleKey, 'error', err.message || 'File parse nahi ho saki.');
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <tr>
      <td>{MODULE_LABELS[moduleKey]}</td>
      <td><button className="btn small" disabled={busy} onClick={handleExport}>Export CSV</button></td>
      <td>
        <input ref={fileRef} type="file" accept=".csv" style={{ maxWidth: 180 }} disabled={busy} onChange={handleImportFile} />
      </td>
    </tr>
  );
}

export default function ImportExport() {
  const [status, setStatus] = useState({}); // moduleKey -> {kind, message}
  const [backupBusy, setBackupBusy] = useState(false);

  function setModuleStatus(moduleKey, kind, message) {
    setStatus((s) => ({ ...s, [moduleKey]: { kind, message } }));
  }

  async function downloadFullBackup() {
    setBackupBusy(true);
    const entries = Object.entries(TABLES);
    const results = await Promise.all(entries.map(([, table]) => supabase.from(table).select('*')));
    setBackupBusy(false);
    const backup = { exported_at: new Date().toISOString() };
    entries.forEach(([key, table], i) => { backup[table] = results[i].data || []; });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kanta-khata-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <>
      <Panel title="Full Backup">
        <div className="note" style={{ marginBottom: 12 }}>
          Ek hi click mein poora data (sab modules) ek JSON file mein download ho jayega — safety backup ke liye.
        </div>
        <button className="btn primary" disabled={backupBusy} onClick={downloadFullBackup}>
          {backupBusy ? 'Preparing…' : 'Download Full Backup (JSON)'}
        </button>
      </Panel>

      <Panel title="Import / Export by Module">
        <div className="note" style={{ marginBottom: 14 }}>
          <b>Export</b> se us module ka pura data CSV mein mil jata hai — Excel mein khol kar dekh/edit kar sakte hain.
          <b> Import</b> ke liye wahi format istemal karein (pehle Export kar ke column headers dekh lein), aur file choose karte hi
          rows seedha add ho jati hain — yeh <b>hamesha nayi entries banata hai</b>, purani entries ko overwrite nahi karta.
        </div>
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Module</th><th>Export</th><th>Import (CSV file)</th></tr></thead>
            <tbody>
              {PERMISSION_MODULES.map((m) => <ModuleRow key={m} moduleKey={m} onStatus={setModuleStatus} />)}
            </tbody>
          </table>
        </div>
        {Object.entries(status).length > 0 && (
          <div style={{ marginTop: 14 }}>
            {Object.entries(status).map(([m, s]) => (
              <div className="alertrow" key={m} style={{ marginBottom: 6 }}>
                <span>{MODULE_LABELS[m]}: {s.message}</span>
                {s.kind === 'ok' && <Badge kind="neg">Done</Badge>}
                {s.kind === 'error' && <Badge kind="pos">Error</Badge>}
                {s.kind === 'info' && <Badge kind="zero">Info</Badge>}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
