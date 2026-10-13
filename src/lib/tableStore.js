// One in-memory store per (table + filters). Every screen showing the same
// list shares it, so a save on one screen shows up everywhere instantly.
//
//  * reads page through the whole result (no 1000-row cut-off)
//  * shows the last saved copy immediately (also when offline), then refreshes
//  * Realtime pushes other users' changes in
//  * writes go to Supabase; if the network is down they are queued (offline)
//  * a delete/update that the database silently refused (no permission) is
//    reported as an error — the old version just hid the row on screen
import { supabase } from './supabaseClient.js';
import { fetchAll } from './fetchAll.js';
import { subscribeTable, onLocalChange, emitLocalChange } from './realtime.js';
import {
  cacheGet, cacheSet, getOutbox, queueAction, findQueuedInsert, patchQueuedInsert, dropQueuedRecord, onOutboxChange,
} from './offline.js';
import { isNetworkError } from './errors.js';
import { uuid } from './uuid.js';

const stores = new Map();

function cmp(a, b) {
  if (a === b) return 0;
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;
  return a > b ? 1 : -1;
}

function makeSorter(o) {
  const dir = o.ascending ? 1 : -1;
  return (a, b) => {
    const c = cmp(a[o.orderBy], b[o.orderBy]);
    if (c) return c * dir;
    if (o.tiebreak) {
      const t = cmp(a[o.tiebreak], b[o.tiebreak]);
      if (t) return t * dir;
    }
    return cmp(String(a.id), String(b.id));
  };
}

export function rowMatches(o, row) {
  if (!row) return false;
  if (o.dateField && (o.from || o.to)) {
    const v = row[o.dateField];
    if (!v) return false;
    const d = String(v).slice(0, 10);
    if (o.from && d < o.from) return false;
    if (o.to && d > o.to) return false;
  }
  if (o.eq) {
    for (const [k, v] of Object.entries(o.eq)) if (row[k] !== v) return false;
  }
  return true;
}

export function normalizeOptions(o = {}) {
  const orderBy = o.orderBy || 'date';
  return {
    orderBy,
    ascending: !!o.ascending,
    tiebreak: o.tiebreak === undefined ? 'created_at' : o.tiebreak,
    dateField: o.dateField || (o.from || o.to ? orderBy : null),
    from: o.from || null,
    to: o.to || null,
    eq: o.eq && Object.keys(o.eq).length ? o.eq : null,
    select: o.select || '*',
  };
}

export function storeKey(table, o) {
  return [table, o.dateField || '', o.from || '', o.to || '', o.eq ? JSON.stringify(o.eq) : '', o.orderBy, o.ascending ? 'a' : 'd', o.select].join('|');
}

function emit(st, patch) {
  st.snap = { ...st.snap, ...patch };
  st.listeners.forEach((l) => l());
}

// server rows + whatever is still waiting in the offline outbox
async function compose(st) {
  let rows = (st.serverRows || []).slice();
  let outbox;
  try { outbox = await getOutbox(); } catch { outbox = []; }
  for (const a of outbox) {
    if (a.table !== st.table) continue;
    if (a.type === 'insert') {
      const r = { ...a.payload, _pending: true };
      rows = rows.filter((x) => x.id !== r.id);
      rows.push(r);
    } else if (a.type === 'update') {
      rows = rows.map((x) => (x.id === a.recordId ? { ...x, ...a.changes, _pending: true } : x));
    } else if (a.type === 'delete') {
      rows = rows.filter((x) => x.id !== a.recordId);
    }
  }
  rows = rows.filter((r) => rowMatches(st.o, r));
  rows.sort(makeSorter(st.o));
  return rows;
}

async function recompose(st) {
  const rows = await compose(st);
  emit(st, { rows });
}

function buildQuery(st, withCount) {
  const o = st.o;
  let q = supabase.from(st.table).select(o.select, withCount ? { count: 'exact' } : undefined);
  if (o.dateField && o.from) q = q.gte(o.dateField, o.from);
  if (o.dateField && o.to) q = q.lte(o.dateField, o.to);
  if (o.eq) for (const [k, v] of Object.entries(o.eq)) q = q.eq(k, v);
  q = q.order(o.orderBy, { ascending: o.ascending });
  if (o.tiebreak) q = q.order(o.tiebreak, { ascending: o.ascending });
  return q.order('id', { ascending: true });
}

export function refreshStore(st) {
  if (st.fetching) return st.fetching;
  st.fetching = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      emit(st, { loading: false, offline: true });
      return;
    }
    const res = await fetchAll((withCount) => buildQuery(st, withCount));
    if (res.error) {
      emit(st, { loading: false, error: res.error, offline: isNetworkError(res) });
      return;
    }
    st.serverRows = res.data;
    cacheSet(st.key, res.data);
    const rows = await compose(st);
    emit(st, { rows, loading: false, error: null, offline: false, lastSynced: Date.now() });
  })().finally(() => {
    st.fetching = null;
  });
  return st.fetching;
}

function scheduleRefresh(st, delay = 600) {
  clearTimeout(st.refreshTimer);
  st.refreshTimer = setTimeout(() => refreshStore(st), delay);
}

function onRealtime(st, payload) {
  if (!st.serverRows) return;
  const ev = payload.eventType;
  if (ev === 'INSERT' || ev === 'UPDATE') {
    const row = payload.new;
    if (!row || row.id == null) return;
    const rest = st.serverRows.filter((x) => x.id !== row.id);
    st.serverRows = rowMatches(st.o, row) ? [...rest, row] : rest;
  } else if (ev === 'DELETE') {
    const id = payload.old && payload.old.id;
    if (id == null) return;
    st.serverRows = st.serverRows.filter((x) => x.id !== id);
  }
  recompose(st);
  clearTimeout(st.cacheTimer);
  st.cacheTimer = setTimeout(() => cacheSet(st.key, st.serverRows), 1500);
}

function start(st) {
  st.started = true;
  (async () => {
    if (st.serverRows) {
      emit(st, { rows: await compose(st), loading: false });
    } else {
      const cached = await cacheGet(st.key);
      if (cached && !st.serverRows) {
        st.serverRows = cached;
        emit(st, { rows: await compose(st), loading: false, fromCache: true });
      }
    }
    await refreshStore(st);
  })();
  const offRt = subscribeTable(st.table, (p) => onRealtime(st, p));
  const offLocal = onLocalChange((t) => {
    if (t === st.table || t === '*') scheduleRefresh(st, 250);
  });
  const offOutbox = onOutboxChange(() => recompose(st));
  const onOnline = () => scheduleRefresh(st, 800);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - (st.snap.lastSynced || 0) > 60000) scheduleRefresh(st, 100);
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  // safety net in case a realtime message was missed (laptop asleep etc.)
  const iv = setInterval(() => {
    if (document.visibilityState === 'visible') refreshStore(st);
  }, 180000);
  st.cleanup = () => {
    offRt();
    offLocal();
    offOutbox();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(iv);
    clearTimeout(st.refreshTimer);
    clearTimeout(st.cacheTimer);
  };
}

function stop(st) {
  st.started = false;
  if (st.cleanup) st.cleanup();
  st.cleanup = null;
}

export function getStore(table, o) {
  const key = storeKey(table, o);
  let st = stores.get(key);
  if (!st) {
    st = {
      key, table, o,
      snap: { rows: [], loading: true, error: null, offline: false, lastSynced: null, fromCache: false },
      listeners: new Set(),
      serverRows: null,
      fetching: null,
      started: false,
      stopTimer: null,
    };
    st.subscribe = (cb) => {
      st.listeners.add(cb);
      clearTimeout(st.stopTimer);
      if (!st.started) start(st);
      return () => {
        st.listeners.delete(cb);
        if (st.listeners.size === 0) {
          clearTimeout(st.stopTimer);
          st.stopTimer = setTimeout(() => {
            if (st.listeners.size === 0) stop(st);
          }, 1500);
        }
      };
    };
    st.getSnapshot = () => st.snap;
    stores.set(key, st);
  }
  return st;
}

export function clearAllStores() {
  stores.forEach((st) => stop(st));
  stores.clear();
}

// ---------------------------------------------------------------- writes

function storesOf(table) {
  return [...stores.values()].filter((st) => st.table === table);
}

function applyServerRow(table, row) {
  storesOf(table).forEach((st) => {
    if (!st.serverRows) return;
    const rest = st.serverRows.filter((x) => x.id !== row.id);
    st.serverRows = rowMatches(st.o, row) ? [...rest, row] : rest;
    recompose(st);
  });
}

function removeServerRow(table, id) {
  storesOf(table).forEach((st) => {
    if (!st.serverRows) return;
    st.serverRows = st.serverRows.filter((x) => x.id !== id);
    recompose(st);
  });
}

function recomposeTable(table) {
  storesOf(table).forEach((st) => recompose(st));
}

function stripLocal(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (!k.startsWith('_')) out[k] = v;
  return out;
}

export async function insertRow(table, payload) {
  const row = stripLocal(payload);
  if (!row.id) row.id = uuid();
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (online) {
    const res = await supabase.from(table).insert(row).select().single();
    if (!res.error && res.data) {
      applyServerRow(table, res.data);
      emitLocalChange(table);
      return { data: res.data, error: null };
    }
    if (!isNetworkError(res)) return { data: null, error: res.error };
  }
  await queueAction({ id: uuid(), table, type: 'insert', recordId: row.id, payload: row });
  recomposeTable(table);
  return { data: { ...row, _pending: true }, error: null, queued: true };
}

export async function updateRow(table, id, changes) {
  const clean = stripLocal(changes);
  delete clean.id;
  if (await findQueuedInsert(id)) {
    await patchQueuedInsert(id, clean);
    recomposeTable(table);
    return { data: null, error: null, queued: true };
  }
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (online) {
    const res = await supabase.from(table).update(clean).eq('id', id).select();
    if (!res.error) {
      if (!res.data || res.data.length === 0) {
        return { data: null, error: { message: 'Yeh entry update nahi hui — shayad aap ko ijazat nahi, ya kisi ne isay delete kar diya hai.' } };
      }
      applyServerRow(table, res.data[0]);
      emitLocalChange(table);
      return { data: res.data[0], error: null };
    }
    if (!isNetworkError(res)) return { data: null, error: res.error };
  }
  await queueAction({ id: uuid(), table, type: 'update', recordId: id, changes: clean });
  recomposeTable(table);
  return { data: null, error: null, queued: true };
}

export async function deleteRow(table, id) {
  if (await findQueuedInsert(id)) {
    await dropQueuedRecord(id);
    recomposeTable(table);
    return { error: null };
  }
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (online) {
    const res = await supabase.from(table).delete().eq('id', id).select('id');
    if (!res.error) {
      if (!res.data || res.data.length === 0) {
        return { error: { message: 'Delete nahi hua — is ki ijazat nahi (ya entry pehle hi delete ho chuki hai).' } };
      }
      removeServerRow(table, id);
      emitLocalChange(table);
      return { error: null };
    }
    if (!isNetworkError(res)) return { error: res.error };
  }
  await queueAction({ id: uuid(), table, type: 'delete', recordId: id });
  recomposeTable(table);
  return { error: null, queued: true };
}
