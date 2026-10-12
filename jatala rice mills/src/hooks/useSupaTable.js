import { useMemo, useSyncExternalStore } from 'react';
import { getStore, normalizeOptions, refreshStore, insertRow, updateRow, deleteRow } from '../lib/tableStore';

// const { rows, loading, error, insert, update, remove, refresh } =
//   useSupaTable('purchases', { from: '2026-10-01', to: '2026-10-31' })
//
// Options: orderBy (default 'date'), ascending, dateField + from/to (server-side
// date filter), eq: { column: value } filters, tiebreak (default 'created_at').
export function useSupaTable(table, options = {}) {
  const { orderBy, ascending, tiebreak, dateField, from, to, select } = options;
  const eqKey = options.eq ? JSON.stringify(options.eq) : '';
  const store = useMemo(
    () => getStore(table, normalizeOptions({ orderBy, ascending, tiebreak, dateField, from, to, select, eq: eqKey ? JSON.parse(eqKey) : null })),
    [table, orderBy, ascending, tiebreak, dateField, from, to, select, eqKey]
  );
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return useMemo(() => ({
    rows: snap.rows,
    loading: snap.loading,
    error: snap.error,
    offline: snap.offline,
    lastSynced: snap.lastSynced,
    insert: (payload) => insertRow(table, payload),
    update: (id, changes) => updateRow(table, id, changes),
    remove: (id) => deleteRow(table, id),
    refresh: () => refreshStore(store),
  }), [snap, table, store]);
}
