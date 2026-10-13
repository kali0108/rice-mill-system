import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getOutbox, getFailed, onOutboxChange, syncOutbox, retryFailed, discardFailed } from '../lib/offline';
import { emitLocalChange } from '../lib/realtime';
import { fmtDateTime } from '../lib/dates';
import { TABLES } from '../lib/schema';
import { useToast } from '../context/ToastContext';
import { T } from '../lib/i18n';

const ACTION_LABEL = { insert: 'Nayi entry', update: 'Tabdeeli', delete: 'Delete' };

function describe(a) {
  const p = a.payload || a.changes || {};
  const name = p.farmer_name || p.arhti_name || p.customer || p.party_name || p.name || p.lot_no || p.category || p.machine || '';
  return [TABLES[a.table]?.label || a.table, ACTION_LABEL[a.type] || a.type, name].filter(Boolean).join(' — ');
}

export default function OfflineBanner() {
  const toast = useToast();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState([]);
  const [showFailed, setShowFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refreshCounts = useCallback(async () => {
    setPending((await getOutbox()).length);
    setFailed(await getFailed());
  }, []);

  const runSync = useCallback(async (manual) => {
    setSyncing(true);
    const res = await syncOutbox(supabase).catch(() => ({ synced: 0, failed: 0, tables: new Set() }));
    setSyncing(false);
    res.tables.forEach((t) => emitLocalChange(t));
    if (res.synced) emitLocalChange('*');
    if (manual || res.synced || res.failed) {
      if (res.synced) toast.success(`${res.synced}${T(" entries server par sync ho gayin.")}`);
      if (res.failed) toast.error(`${res.failed}${T(" entries server ne qabool nahi kin — tafseel banner mein dekhein.")}`);
    }
    refreshCounts();
  }, [toast, refreshCounts]);

  useEffect(() => {
    refreshCounts();
    const off = onOutboxChange(refreshCounts);
    const goOnline = () => { setOnline(true); runSync(false); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // first sync on app start + retry every 30s while something is waiting
    const first = setTimeout(() => runSync(false), 1500);
    const iv = setInterval(async () => {
      if (navigator.onLine && (await getOutbox()).length) runSync(false);
    }, 30000);
    return () => {
      off();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [refreshCounts, runSync]);

  if (online && pending === 0 && failed.length === 0) return null;

  return (
    <div className={`offline-banner ${!online ? 'offline' : failed.length ? 'failed' : 'syncing'}`}>
      <div className="ob-row">
        <span>
          {!online
            ? `${T("Aap offline hain — entries is device par save ho rahi hain, internet aate hi khud sync ho jayengi.")}${pending ? ` (${pending}${T(" baqi)")}` : ''}`
            : pending
              ? `${pending}${T(" entries sync honi baqi hain…")}`
              : ''}
          {failed.length ? ` ${failed.length}${T(" entries server ne qabool nahi kin.")}` : ''}
        </span>
        <span className="ob-actions">
          {online && pending > 0 && (
            <button type="button" className="btn small" disabled={syncing} onClick={() => runSync(true)}>
              {syncing ? T("Sync ho raha hai…") : T("Abhi Sync Karein")}
            </button>
          )}
          {failed.length > 0 && (
            <button type="button" className="btn small" onClick={() => setShowFailed((s) => !s)}>
              {showFailed ? T("Chupayein") : T("Tafseel")}
            </button>
          )}
        </span>
      </div>
      {showFailed && failed.length > 0 && (
        <div className="failed-list">
          {failed.map((a) => (
            <div key={a.id} className="failed-item">
              <div>
                <b>{describe(a)}</b>
                <div className="muted">{a.error} · {fmtDateTime(new Date(a.failedAt || Date.now()).toISOString())}</div>
              </div>
              <div className="row-actions">
                <button type="button" className="btn small" onClick={async () => { await retryFailed(a.id); runSync(true); }}>{T("Dobara bhejein")}</button>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={async () => {
                    if (window.confirm(T("Yeh entry hamesha ke liye hata dein?"))) {
                      await discardFailed(a.id);
                      emitLocalChange(a.table);
                    }
                  }}
                >{T("Hata dein")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
