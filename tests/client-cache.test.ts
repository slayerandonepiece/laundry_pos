import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Order } from '../src/features/admin/admin.types';
import { SESSION_KEY, cacheCreatedOrder, cacheGeneration, clearClientCaches, isFresh, isOrder, mergeOrders, readListCache, readOrdersCache, watchSessionMirror, writeCache } from '../src/features/admin/client-cache';

const order: Order = { id: 'EL-1', name: 'Customer', phone: '9999999999', date: '2026-09-27', due: '2026-09-28', status: 'Pending', lines: [], payments: [], notes: '' };

test('Cross-tab logout invalidates pending cache work and removes its event subscription on cleanup', () => {
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  let removed = 0, updated = 0;
  const stop = watchSessionMirror(() => { removed++; }, () => { updated++; });
  const generation = cacheGeneration();
  const emit = (key: string | null, newValue: string | null) => target.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }));
  try {
    emit('unrelated', null);
    assert.equal(removed, 0);
    emit(SESSION_KEY, '{"storeId":"another-store"}');
    assert.equal(updated, 1);
    emit(SESSION_KEY, null);
    assert.equal(removed, 1);
    assert.equal(cacheGeneration(), generation + 1);
    emit(null, null);
    assert.equal(removed, 2);
    stop();
    emit(SESSION_KEY, null);
    assert.equal(removed, 2);
  } finally { stop(); Reflect.deleteProperty(globalThis, 'window'); }
});

test('Future cache timestamps and expired entries are not fresh', () => {
  assert.equal(isFresh(Date.now() + 60_000, 60_000), false);
  assert.equal(isFresh(Date.now() - 300_001, 300_000), false);
  assert.equal(isFresh(Date.now(), 300_000), true);
});

test('Delta merge updates status, removes cancelled orders and preserves concurrent new sales', () => {
  const result = mergeOrders([order, { ...order, id: 'EL-2' }], [{ ...order, status: 'Ready' }, { ...order, id: 'EL-2', deleted: true }, { ...order, id: 'EL-3' }]);
  assert.deepEqual(result.map(row => row.id), ['EL-3', 'EL-1']);
  assert.equal(result[1].status, 'Ready');
});

test('Corrupt or unavailable storage falls back without throwing; store caches stay isolated and logout clears them', () => {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  } });
  try {
    entries.set('broken', '{bad json');
    assert.equal(readListCache('broken', isOrder), null);
    writeCache('invalid', { data: [{ id: 'EL-1', lines: [null] }], cachedAt: Date.now() });
    assert.equal(readListCache('invalid', isOrder), null);
    writeCache('el-orders-cache-a', { data: [order], cachedAt: Date.now(), lastSyncAt: '2026-09-26T00:00:00.000Z', complete: true });
    cacheCreatedOrder('a', { ...order, id: 'EL-2' });
    assert.equal(readOrdersCache('a')?.lastSyncAt, '2026-09-26T00:00:00.000Z');
    assert.equal(readOrdersCache('a')?.complete, true);
    assert.equal(readOrdersCache('a')?.data.length, 2);
    assert.equal(readOrdersCache('b'), null);
    cacheCreatedOrder('b', order);
    assert.equal(readOrdersCache('b')?.complete, false);
    const previousGeneration = cacheGeneration();
    clearClientCaches();
    assert.equal(cacheGeneration(), previousGeneration + 1);
    assert.equal(readOrdersCache('a'), null);
    assert.equal(readOrdersCache('b'), null);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Private mode'); } });
    assert.equal(readOrdersCache('a'), null);
    assert.doesNotThrow(() => cacheCreatedOrder('a', order));
    assert.doesNotThrow(clearClientCaches);
  } finally { Reflect.deleteProperty(globalThis, 'localStorage'); }
});
