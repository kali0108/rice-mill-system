// Offline support.
//  * Writes made without internet go into an "outbox" in IndexedDB and are
//    replayed in order once the device is online again.
//  * A write the server REJECTS (no permission, invalid data) is moved to a
//    "failed" list the user can see, retry or discard — it no longer blocks
//    every entry queued after it (the old version got stuck forever).
//  * Reads fall back to the last copy of each list saved on this device.
import { get, set, del, keys } from 'idb-keyval';
import { isRetryableError, errorMessage } from './errors.js';

const OUTBOX = 'kk:outbox';
const FAILED = 'kk:failed';
const CACHE_PREFIX = 'kk:cache:';

// ---------------------------------------------------------------- change signal
const listeners = new Set();
export function onOutboxChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error(e); }
  });
}

// Serialise every read-modify-write of the outbox (several screens can queue
// at the same moment).
let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function getOutbox() {
  return (await get(OUTBOX)) || [];
}
export async function getFailed() {
  return (await get(FAILED)) || [];
}
export async function outboxCount() {
  return (await getOutbox()).length;
}

// action: { id, table, type: 'insert'|'update'|'delete', recordId, payload?, changes? }
export function queueAction(action) {
  return locked(async () => {
    const ob = await getOutbox();
    ob.push({ ...action, queuedAt: Date.now() });
    await set(OUTBOX, ob);
  }).then(notify);
}

export async function findQueuedInsert(recordId) {
  const ob = await getOutbox();
  return ob.find((a) => a.type === 'insert' && a.recordId === recordId) || null;
}

// Edit an entry that was created offline and hasn't synced yet
export function patchQueuedInsert(recordId, changes) {
  return locked(async () => {
    const ob = await getOutbox();
    const a = ob.find((x) => x.type === 'insert' && x.recordId === recordId);
    if (!a) return false;
    a.payload = { ...a.payload, ...changes };
    await set(OUTBOX, ob);
    return true;
  }).then((r) => { notify(); return r; });
}

// Delete an entry that was created offline and hasn't synced yet
export function dropQueuedRecord(recordId) {
  return locked(async () => {
    const ob = await getOutbox();
    await set(OUTBOX, ob.filter((x) => x.recordId !== recordId));
  }).then(notify);
}

function removeAction(actionId) {
  return locked(async () => {
    const ob = await getOutbox();
    await set(OUTBOX, ob.filter((x) => x.id !== actionId));
  });
}

function moveToFailed(action, error) {
  return locked(async () => {
    const ob = await getOutbox();
    await set(OUTBOX, ob.filter((x) => x.id !== action.id));
    const failed = await getFailed();
    failed.push({ ...action, error: errorMessage(error), failedAt: Date.now() });
    await set(FAILED, failed);
  });
}

export function retryFailed(actionId) {
  return locked(async () => {
    const failed = await getFailed();
    const a = failed.find((x) => x.id === actionId);
    if (!a) return;
    await set(FAILED, failed.filter((x) => x.id !== actionId));
    const ob = await getOutbox();
    const { error, failedAt, ...rest } = a;
    ob.push(rest);
    await set(OUTBOX, ob);
  }).then(notify);
}

export function discardFailed(actionId) {
  return locked(async () => {
    const failed = await getFailed();
    await set(FAILED, failed.filter((x) => x.id !== actionId));
  }).then(notify);
}

// ---------------------------------------------------------------- sync
let syncPromise = null;

async function runAction(supabase, a) {
  if (a.type === 'insert') {
    const res = await supabase.from(a.table).insert(a.payload);
    // Same id already on the server = an earlier attempt did get through
    if (res.error && res.error.code === '23505' && /_pkey/.test(res.error.message || '')) return { error: null };
    return res;
  }
  if (a.type === 'update') {
    return supabase.from(a.table).update(a.changes).eq('id', a.recordId);
  }
  if (a.type === 'delete') {
    return supabase.from(a.table).delete().eq('id', a.recordId);
  }
  return { error: { message: 'Unknown action' } };
}

// Replays the outbox in order. Stops (keeping everything) on a connectivity
// problem; a real rejection moves just that one entry to the failed list.
export function syncOutbox(supabase) {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const result = { synced: 0, failed: 0, tables: new Set() };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return result;
    const ob = await getOutbox();
    for (const queued of ob) {
      // re-read: the entry may have been edited or deleted while we waited
      const a = (await getOutbox()).find((x) => x.id === queued.id);
      if (!a) continue;
      let res;
      try {
        res = await runAction(supabase, a);
      } catch (e) {
        res = { error: e, status: 0 };
      }
      if (!res.error) {
        await removeAction(a.id);
        result.synced++;
        result.tables.add(a.table);
      } else if (isRetryableError(res)) {
        console.warn('[Kanta Khata] sync paused:', errorMessage(res.error));
        break;
      } else {
        await moveToFailed(a, res.error);
        result.failed++;
        result.tables.add(a.table);
      }
    }
    return result;
  })().finally(() => {
    syncPromise = null;
    notify();
  });
  return syncPromise;
}

// ---------------------------------------------------------------- read cache
export async function cacheSet(key, rows) {
  try { await set(CACHE_PREFIX + key, rows); } catch (e) { console.warn('[Kanta Khata] cache write failed', e); }
}
export async function cacheGet(key) {
  try { return (await get(CACHE_PREFIX + key)) ?? null; } catch { return null; }
}

// Sign-out on a shared device: remove every cached list + queued entry
export async function clearLocalData() {
  const all = await keys();
  await Promise.all(all.filter((k) => typeof k === 'string' && k.startsWith('kk:')).map((k) => del(k)));
  notify();
}
