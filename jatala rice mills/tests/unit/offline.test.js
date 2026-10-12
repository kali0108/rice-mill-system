import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueAction, getOutbox, getFailed, patchQueuedInsert, dropQueuedRecord, syncOutbox, retryFailed, discardFailed, clearLocalData, cacheSet, cacheGet,
} from '../../src/lib/offline.js';


// Minimal stand-in for supabase.from(table).insert/update/delete
function fakeSupabase(plan) {
  const log = [];
  const respond = (op, table) => {
    log.push(`${op}:${table}`);
    const r = plan.shift() || { error: null };
    return Promise.resolve(r);
  };
  return {
    log,
    from(table) {
      return {
        insert: () => respond('insert', table),
        update: () => ({ eq: () => respond('update', table) }),
        delete: () => ({ eq: () => respond('delete', table) }),
      };
    },
  };
}

beforeEach(async () => {
  await clearLocalData();
});

test('queue, edit and cancel an offline entry before it syncs', async () => {
  await queueAction({ id: 'a1', table: 'purchases', type: 'insert', recordId: 'r1', payload: { id: 'r1', farmer_name: 'Ali' } });
  await patchQueuedInsert('r1', { farmer_name: 'Ali Raza' });
  let ob = await getOutbox();
  assert.equal(ob.length, 1);
  assert.equal(ob[0].payload.farmer_name, 'Ali Raza');
  await dropQueuedRecord('r1');
  ob = await getOutbox();
  assert.equal(ob.length, 0, 'deleting an unsynced entry removes it from the queue (old bug: it came back)');
});

test('sync replays in order; network error pauses and keeps the rest', async () => {
  await queueAction({ id: 'a1', table: 'sales', type: 'insert', recordId: 's1', payload: { id: 's1' } });
  await queueAction({ id: 'a2', table: 'sales', type: 'update', recordId: 's1', changes: { rate: 5 } });
  const sb = fakeSupabase([{ error: null }, { error: { message: 'TypeError: Failed to fetch' }, status: 0 }]);
  const res = await syncOutbox(sb);
  assert.equal(res.synced, 1);
  assert.deepEqual(sb.log, ['insert:sales', 'update:sales']);
  const ob = await getOutbox();
  assert.equal(ob.length, 1);
  assert.equal(ob[0].id, 'a2');
});

test('a rejected entry goes to "failed" and does not block the queue', async () => {
  await queueAction({ id: 'a1', table: 'payments', type: 'insert', recordId: 'p1', payload: { id: 'p1' } });
  await queueAction({ id: 'a2', table: 'expenses', type: 'insert', recordId: 'e1', payload: { id: 'e1' } });
  const sb = fakeSupabase([{ error: { message: 'new row violates row-level security policy', code: '42501' }, status: 403 }, { error: null }]);
  const res = await syncOutbox(sb);
  assert.equal(res.synced, 1);
  assert.equal(res.failed, 1);
  assert.equal((await getOutbox()).length, 0);
  const failed = await getFailed();
  assert.equal(failed.length, 1);
  assert.match(failed[0].error, /row-level security/);
  await retryFailed('a1');
  assert.equal((await getOutbox()).length, 1);
  assert.equal((await getFailed()).length, 0);
  await queueAction({ id: 'a3', table: 'x', type: 'delete', recordId: 'z' });
  await syncOutbox(fakeSupabase([{ error: null }, { error: { message: 'bad', code: 'P0001' }, status: 400 }]));
  const f2 = await getFailed();
  assert.equal(f2.length, 1);
  await discardFailed(f2[0].id);
  assert.equal((await getFailed()).length, 0);
});

test('a retried insert that already reached the server counts as done', async () => {
  await queueAction({ id: 'a1', table: 'sales', type: 'insert', recordId: 's9', payload: { id: 's9' } });
  const res = await syncOutbox(fakeSupabase([{ error: { code: '23505', message: 'duplicate key value violates unique constraint "sales_pkey"' }, status: 409 }]));
  assert.equal(res.synced, 1);
  assert.equal((await getOutbox()).length, 0);
});

test('expired login pauses sync instead of discarding entries', async () => {
  await queueAction({ id: 'a1', table: 'sales', type: 'insert', recordId: 's1', payload: { id: 's1' } });
  const res = await syncOutbox(fakeSupabase([{ error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 }]));
  assert.equal(res.synced, 0);
  assert.equal((await getOutbox()).length, 1);
  assert.equal((await getFailed()).length, 0);
});

test('read cache + sign-out wipe', async () => {
  await cacheSet('purchases|x', [{ id: 1 }]);
  assert.deepEqual(await cacheGet('purchases|x'), [{ id: 1 }]);
  await clearLocalData();
  assert.equal(await cacheGet('purchases|x'), null);
});
