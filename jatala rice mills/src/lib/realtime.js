import { supabase } from './supabaseClient.js';

// One Realtime channel per table, shared by every screen that shows it.
const channels = new Map(); // table -> { channel, listeners }
let topicSeq = 0;

export function subscribeTable(table, listener) {
  let entry = channels.get(table);
  if (!entry) {
    const listeners = new Set();
    const channel = supabase
      .channel(`kk-${table}-${++topicSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        listeners.forEach((fn) => {
          try { fn(payload); } catch (e) { console.error('[Jatala Rice Mills] realtime handler', e); }
        });
      })
      .subscribe();
    entry = { channel, listeners };
    channels.set(table, entry);
  }
  entry.listeners.add(listener);
  return () => {
    const e = channels.get(table);
    if (!e) return;
    e.listeners.delete(listener);
    if (e.listeners.size === 0) {
      channels.delete(table);
      supabase.removeChannel(e.channel).catch(() => {});
    }
  };
}

export function closeAllChannels() {
  channels.forEach((e) => supabase.removeChannel(e.channel).catch(() => {}));
  channels.clear();
}

// In-app "something changed in table X" signal: own saves, offline sync,
// imports, resets. table '*' means everything.
const localListeners = new Set();
export function emitLocalChange(table) {
  localListeners.forEach((fn) => {
    try { fn(table); } catch (e) { console.error(e); }
  });
}
export function onLocalChange(fn) {
  localListeners.add(fn);
  return () => localListeners.delete(fn);
}
