import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll } from '../../src/lib/fetchAll.js';

function fakeTable(total, maxRows) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  let calls = 0;
  const build = (withCount) => ({
    range(from, to) {
      calls++;
      const end = Math.min(to, from + maxRows - 1);
      return Promise.resolve({ data: all.slice(from, end + 1), error: null, count: withCount ? total : null, status: 200 });
    },
  });
  return { build, calls: () => calls };
}

test('reads past the 1000-row limit', async () => {
  const t = fakeTable(2500, 1000);
  const { data } = await fetchAll(t.build);
  assert.equal(data.length, 2500);
  assert.equal(t.calls(), 3);
});

test('works when the server caps pages lower than requested', async () => {
  const t = fakeTable(1234, 500);
  const { data } = await fetchAll(t.build);
  assert.equal(data.length, 1234);
});

test('empty table and errors', async () => {
  assert.equal((await fetchAll(fakeTable(0, 1000).build)).data.length, 0);
  const failing = () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' }, status: 500 }) });
  const res = await fetchAll(failing);
  assert.equal(res.error.message, 'boom');
});
