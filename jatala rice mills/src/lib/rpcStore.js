// Shared, cached results of database report functions (balances, stock,
// cash book...). Every screen asking for the same function + parameters gets
// one request; any change to a "watched" table refreshes it automatically.
import { supabase } from './supabaseClient.js';
import { subscribeTable, onLocalChange } from './realtime.js';
import { cacheGet, cacheSet } from './offline.js';
import { isNetworkError } from './errors.js';

const stores = new Map();

function emit(st, patch) {
  st.snap = { ...st.snap, ...patch };
  st.listeners.forEach((l) => l());
}

export function refreshRpc(st) {
  if (st.fetching) {
    st.again = true;
    return st.fetching;
  }
  st.fetching = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      emit(st, { loading: false, offline: true });
      return;
    }
    const { data, error, status } = await supabase.rpc(st.fn, st.params);
    if (error) {
      emit(st, { loading: false, error, offline: isNetworkError({ error, status }) });
      return;
    }
    cacheSet('rpc:' + st.key, data);
    emit(st, { data, loading: false, error: null, offline: false, lastSynced: Date.now() });
  })().finally(() => {
    st.fetching = null;
    if (st.again) {
      st.again = false;
      refreshRpc(st);
    }
  });
  return st.fetching;
}

function schedule(st, delay = 700) {
  clearTimeout(st.timer);
  st.timer = setTimeout(() => refreshRpc(st), delay);
}

function start(st) {
  st.started = true;
  (async () => {
    if (st.snap.data == null) {
      const cached = await cacheGet('rpc:' + st.key);
      if (cached != null && st.snap.data == null) emit(st, { data: cached, loading: false, fromCache: true });
    }
    await refreshRpc(st);
  })();
  const offs = st.watch.map((t) => subscribeTable(t, () => schedule(st)));
  offs.push(onLocalChange((t) => {
    if (t === '*' || st.watch.includes(t)) schedule(st, 300);
  }));
  const onOnline = () => schedule(st, 900);
  window.addEventListener('online', onOnline);
  const iv = setInterval(() => {
    if (document.visibilityState === 'visible') refreshRpc(st);
  }, 180000);
  st.cleanup = () => {
    offs.forEach((off) => off());
    window.removeEventListener('online', onOnline);
    clearInterval(iv);
    clearTimeout(st.timer);
  };
}

export function getRpcStore(fn, params, watch) {
  const key = fn + ':' + JSON.stringify(params || {});
  let st = stores.get(key);
  if (!st) {
    st = {
      key, fn, params: params || {}, watch: watch || [],
      snap: { data: null, loading: true, error: null, offline: false, lastSynced: null },
      listeners: new Set(), started: false, fetching: null, again: false,
    };
    st.subscribe = (cb) => {
      st.listeners.add(cb);
      clearTimeout(st.stopTimer);
      if (!st.started) start(st);
      return () => {
        st.listeners.delete(cb);
        if (st.listeners.size === 0) {
          st.stopTimer = setTimeout(() => {
            if (st.listeners.size === 0 && st.started) {
              st.started = false;
              if (st.cleanup) st.cleanup();
            }
          }, 1500);
        }
      };
    };
    st.getSnapshot = () => st.snap;
    stores.set(key, st);
  } else {
    for (const t of watch || []) if (!st.watch.includes(t)) st.watch.push(t);
  }
  return st;
}

export function clearAllRpcStores() {
  stores.forEach((st) => {
    if (st.cleanup) st.cleanup();
  });
  stores.clear();
}
