import { createContext, useCallback, useContext, useMemo } from 'react';
import { useSupaTable } from '../hooks/useSupaTable';
import { useRpc, WATCH } from '../hooks/useRpc';
import { DEFAULT_PRODUCTS, DEFAULT_VARIETIES } from '../lib/constants';
import { defaultCategory } from '../lib/calc';

export const DEFAULT_SETTINGS = {
  id: 1, mill_name: 'Rice Mill', address: '', phone: '', ntn: '', strn: '', season_start: null,
  fumigation_days: 30, ageing_days: 60, invoice_prefix: 'INV-', slip_prefix: 'PS-', invoice_footer: '',
};

const SettingsCtx = createContext({ settings: DEFAULT_SETTINGS, save: async () => ({}), loading: true });
const PartiesCtx = createContext(null);
const CatalogCtx = createContext(null);

export function DataProvider({ children }) {
  const settingsTable = useSupaTable('settings', { orderBy: 'id', ascending: true, tiebreak: null });
  const partiesTable = useSupaTable('parties', { orderBy: 'name', ascending: true, tiebreak: null });
  const balances = useRpc('get_party_balances', {}, { watch: WATCH.balances });
  const productsTable = useSupaTable('products', { orderBy: 'sort_order', ascending: true, tiebreak: 'name' });
  const varietiesTable = useSupaTable('varieties', { orderBy: 'sort_order', ascending: true, tiebreak: 'name' });

  const settingsRows = settingsTable.rows;
  const updateSettings = settingsTable.update;
  const settingsValue = useMemo(() => ({
    settings: { ...DEFAULT_SETTINGS, ...(settingsRows[0] || {}) },
    save: (changes) => updateSettings(1, changes),
    loading: settingsTable.loading,
  }), [settingsRows, updateSettings, settingsTable.loading]);

  const parties = partiesTable.rows;
  const balanceRows = balances.data;
  const balanceMap = useMemo(() => {
    const m = new Map();
    (balanceRows || []).forEach((b) => m.set(`${b.party_type}|${String(b.party_name).toLowerCase()}`, b));
    return m;
  }, [balanceRows]);

  const findParty = useCallback((type, name) => {
    const k = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!k) return null;
    return parties.find((p) => p.party_type === type && p.name.toLowerCase() === k) || null;
  }, [parties]);

  const partiesValue = useMemo(() => ({
    parties,
    loading: partiesTable.loading,
    insert: partiesTable.insert,
    update: partiesTable.update,
    remove: partiesTable.remove,
    namesOf: (type) => parties.filter((p) => !type || p.party_type === type).map((p) => p.name),
    findParty,
    // exact spelling already used in the khata (so one party = one khata)
    canonicalName: (type, name) => {
      const clean = String(name || '').trim().replace(/\s+/g, ' ');
      const found = findParty(type, clean);
      return found ? found.name : clean;
    },
    balances: balanceRows || [],
    balancesLoading: balances.loading,
    balanceOf: (type, name) => {
      const b = balanceMap.get(`${type}|${String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()}`);
      return b ? Number(b.balance) : 0;
    },
  }), [parties, partiesTable, findParty, balanceRows, balances.loading, balanceMap]);

  // Products & varieties (managed lists). Built-in defaults only until the first load.
  const productRows = productsTable.rows;
  const varietyRows = varietiesTable.rows;
  const productsLoading = productsTable.loading;
  const varietiesLoading = varietiesTable.loading;
  const catalogValue = useMemo(() => {
    const products = productRows.length || !productsLoading ? productRows : DEFAULT_PRODUCTS;
    const varieties = varietyRows.length || !varietiesLoading ? varietyRows : DEFAULT_VARIETIES.map((name, i) => ({ name, active: true, sort_order: i }));
    const productMap = new Map(products.map((p) => [p.name.toLowerCase(), p]));
    const key = (n) => String(n || '').trim().toLowerCase();
    return {
      products,
      varieties,
      activeProducts: products.filter((p) => p.active !== false),
      varietyNames: varieties.filter((v) => v.active !== false).map((v) => v.name),
      productByName: (n) => productMap.get(key(n)) || null,
      categoryOf: (n) => productMap.get(key(n))?.category || defaultCategory(n),
      hasVariety: (n) => {
        const p = productMap.get(key(n));
        return p ? p.has_variety !== false : !['bran/chokar', 'husk/tuti'].includes(key(n));
      },
      loading: productsLoading || varietiesLoading,
      insertProduct: productsTable.insert,
      updateProduct: productsTable.update,
      removeProduct: productsTable.remove,
      insertVariety: varietiesTable.insert,
      updateVariety: varietiesTable.update,
      removeVariety: varietiesTable.remove,
    };
  }, [productRows, varietyRows, productsLoading, varietiesLoading, productsTable, varietiesTable]);

  return (
    <SettingsCtx.Provider value={settingsValue}>
      <PartiesCtx.Provider value={partiesValue}>
        <CatalogCtx.Provider value={catalogValue}>{children}</CatalogCtx.Provider>
      </PartiesCtx.Provider>
    </SettingsCtx.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsCtx);
}

export function useParties() {
  return useContext(PartiesCtx);
}

export function useCatalog() {
  return useContext(CatalogCtx);
}
