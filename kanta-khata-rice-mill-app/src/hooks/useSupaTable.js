import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { cacheTable, getCachedTable, queueAction, syncOutbox } from '../lib/offline';

// One hook powers every module page: `const { rows, loading, insert, update, remove, refresh } = useSupaTable('purchases')`
// - Online: reads/writes go straight to Supabase (Postgres RLS decides what's allowed).
// - Offline: writes are queued locally and applied optimistically to `rows`;
//   reads fall back to the last-synced cache.
// - Coming back online triggers a queue replay, then a fresh refresh().
export function useSupaTable(table, { orderBy = 'date', ascending = false } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (navigator.onLine) {
      const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending });
      if (!error && data) {
        setRows(data);
        await cacheTable(table, data);
      } else {
        setRows(await getCachedTable(table));
      }
    } else {
      setRows(await getCachedTable(table));
    }
    setLoading(false);
  }, [table, orderBy, ascending]);

  useEffect(() => {
    refresh();
    const onOnline = async () => {
      await syncOutbox(supabase);
      await refresh();
    };
    window.addEventListener('online', onOnline);
    const interval = setInterval(onOnline, 20000); // gentle retry even without an 'online' event
    return () => { window.removeEventListener('online', onOnline); clearInterval(interval); };
  }, [refresh]);

  async function insert(payload) {
    const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = { ...payload, id: tempId, _pending: true };
    setRows((r) => [optimistic, ...r]);

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase.from(table).insert(payload).select().single();
        if (!error && data) {
          setRows((r) => r.map((x) => (x.id === tempId ? data : x)));
          return { data, error: null };
        }
        // Server responded and rejected it (RLS denial, validation, etc.) — a
        // real error, not a connectivity problem. Surface it, don't queue.
        setRows((r) => r.filter((x) => x.id !== tempId));
        return { data: null, error };
      } catch (networkErr) {
        // fetch() itself threw — we never got a response, so this is a
        // connectivity blip even though navigator.onLine said we were online.
        // Fall through to queueing below instead of losing the entry.
      }
    }
    await queueAction(table, 'insert', payload, tempId);
    setPendingCount((c) => c + 1);
    return { data: optimistic, error: null, queued: true };
  }

  async function remove(id) {
    setRows((r) => r.filter((x) => x.id !== id));
    if (String(id).startsWith('local_')) return; // was never synced — nothing to delete server-side
    if (navigator.onLine) {
      try {
        await supabase.from(table).delete().eq('id', id);
        return;
      } catch (networkErr) { /* fall through to queue */ }
    }
    await queueAction(table, 'delete', { id });
    setPendingCount((c) => c + 1);
  }

  async function update(id, changes) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...changes } : x)));
    if (navigator.onLine) {
      try {
        await supabase.from(table).update(changes).eq('id', id);
        return;
      } catch (networkErr) { /* fall through to queue */ }
    }
    await queueAction(table, 'update', { id, changes });
    setPendingCount((c) => c + 1);
  }

  return { rows, loading, insert, update, remove, refresh, pendingCount };
}
