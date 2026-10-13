import { useMemo, useSyncExternalStore } from 'react';
import { getRpcStore, refreshRpc } from '../lib/rpcStore';

const IDLE = { data: null, loading: false, error: null, offline: false, lastSynced: null };
const idleSubscribe = () => () => {};
const idleSnapshot = () => IDLE;

// const { data, loading, error, refresh } = useRpc('get_party_balances', {}, { watch: ['ledger_entries'] })
export function useRpc(fn, params = {}, { watch = [], enabled = true } = {}) {
  const paramsKey = JSON.stringify(params || {});
  const watchKey = watch.join(',');
  const store = useMemo(
    () => (enabled ? getRpcStore(fn, JSON.parse(paramsKey), watchKey ? watchKey.split(',') : []) : null),
    [fn, paramsKey, watchKey, enabled]
  );
  const snap = useSyncExternalStore(store ? store.subscribe : idleSubscribe, store ? store.getSnapshot : idleSnapshot);
  return useMemo(() => ({ ...snap, refresh: () => (store ? refreshRpc(store) : Promise.resolve()) }), [snap, store]);
}

// Tables each report depends on (used as `watch`)
export const WATCH = {
  balances: ['ledger_entries'],
  stock: ['purchases', 'production_batches', 'sales', 'stock_adjustments', 'drying_batches'],
  cash: ['payments', 'purchases', 'sales', 'expenses', 'machinery_log', 'transport_entries', 'labor_entries', 'zakat_assessments', 'cash_entries'],
  dashboard: ['purchases', 'sales', 'production_batches', 'labor_entries'],
};
