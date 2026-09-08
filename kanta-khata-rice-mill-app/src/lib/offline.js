// Offline support: while there's no network, writes are queued in IndexedDB
// (the "outbox") and reads fall back to the last-synced cache of each table.
// When the browser comes back online, the outbox is replayed against Supabase
// in order. This is a practical offline-first pattern for a browser SPA — it
// does not rely on the Service Worker Background Sync API, which has patchy
// support (notably iOS Safari), so it works reliably on the phones/tablets a
// mill floor actually uses.

import { get, set } from 'idb-keyval';

const OUTBOX_KEY = 'kk:outbox';
const cacheKey = (table) => `kk:cache:${table}`;

export async function getOutbox() {
  return (await get(OUTBOX_KEY)) || [];
}

export async function queueAction(table, type, payload, tempId) {
  const outbox = await getOutbox();
  outbox.push({ id: tempId || `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, table, type, payload, queuedAt: Date.now() });
  await set(OUTBOX_KEY, outbox);
}

export async function removeFromOutbox(id) {
  const outbox = await getOutbox();
  await set(OUTBOX_KEY, outbox.filter((o) => o.id !== id));
}

export async function cacheTable(table, rows) {
  await set(cacheKey(table), rows);
}

export async function getCachedTable(table) {
  return (await get(cacheKey(table))) || [];
}

// Multiple pages can mount several useSupaTable() hooks at once (e.g. Reports),
// each listening for the 'online' event. Without a lock they could all call
// syncOutbox() at the same moment and double-submit the same queued write.
let syncing = false;

// Replays every queued write against Supabase, in the order they were made.
// Returns the number of actions successfully synced.
export async function syncOutbox(supabase) {
  if (!navigator.onLine || syncing) return 0;
  syncing = true;
  try {
    return await runSync(supabase);
  } finally {
    syncing = false;
  }
}

async function runSync(supabase) {
  const outbox = await getOutbox();
  let synced = 0;
  for (const action of outbox) {
    try {
      if (action.type === 'insert') {
        const { error } = await supabase.from(action.table).insert(action.payload);
        if (error) throw error;
      } else if (action.type === 'update') {
        const { error } = await supabase.from(action.table).update(action.payload.changes).eq('id', action.payload.id);
        if (error) throw error;
      } else if (action.type === 'delete') {
        const { error } = await supabase.from(action.table).delete().eq('id', action.payload.id);
        if (error) throw error;
      }
      await removeFromOutbox(action.id);
      synced++;
    } catch (e) {
      // Stop at the first failure (likely still offline, or a real conflict) —
      // keep the rest of the queue intact and try again on the next trigger.
      console.warn('[Kanta Khata] Sync paused:', e.message || e);
      break;
    }
  }
  return synced;
}

export async function outboxCount() {
  return (await getOutbox()).length;
}
