'use client';

import { useEffect, useRef, useState } from 'react';
import type { Order } from '../admin.types';
import { ORDERS_TTL, cacheGeneration, isFresh, isOrder, mergeOrders, readOrdersCache, withCacheLock, writeCache } from '../client-cache';

export function useOrdersCache(storeId: string, enabled: boolean, serverOrders: Order[]) {
  const [snapshot, setSnapshot] = useState<{ storeId: string; data: Order[] } | null>(null);
  const initialized = useRef<string | null>(null);
  useEffect(() => {
    if (!storeId || !enabled) return;
    const key = `el-orders-cache-${storeId}`, generation = cacheGeneration();
    const controller = new AbortController();
    const cached = readOrdersCache(storeId);
    let orders = initialized.current !== storeId && cached && isFresh(cached.cachedAt, ORDERS_TTL) ? cached.complete ? cached.data : mergeOrders(serverOrders, cached.data) : serverOrders;
    initialized.current = storeId;
    const active = () => !controller.signal.aborted && generation === cacheGeneration();
    const publish = () => { if (active()) setSnapshot({ storeId, data: orders }); };
    publish();
    async function refresh() {
      if (!navigator.onLine || !active()) return;
      await withCacheLock(`el-orders-sync-${storeId}`, controller.signal, async () => {
        const previous = readOrdersCache(storeId);
        let cursor = previous?.complete ? previous.lastSyncAt : null;
        let syncedAt: string | null = null;
        const deltas: (Order & { deleted?: boolean })[] = [];
        const seen = new Set<string>();
        do {
          if (!active()) return;
          const query = new URLSearchParams({ limit: '200' });
          if (cursor) query.set('since', cursor);
          const response = await fetch(`/api/v1/orders/sync?${query}`, { headers: { 'X-Store-Id': storeId }, cache: 'no-store', signal: controller.signal });
          if (!response.ok) return;
          const result = await response.json();
          if (!Array.isArray(result.orders) || !result.orders.every(isOrder) || (result.nextCursor !== null && typeof result.nextCursor !== 'string') || !Number.isFinite(Date.parse(result.syncedAt))) return;
          syncedAt ??= result.syncedAt;
          deltas.push(...result.orders);
          cursor = result.nextCursor;
          if (cursor) { if (seen.has(cursor)) return; seen.add(cursor); }
        } while (cursor);
        if (!active()) return;
        // Re-read to preserve a sale written through while the network request was running.
        orders = mergeOrders(mergeOrders(orders, readOrdersCache(storeId)?.data ?? []), deltas);
        writeCache(key, { data: orders, cachedAt: Date.now(), lastSyncAt: syncedAt, complete: true });
        publish();
      });
    }
    const sync = () => { void refresh().catch(() => undefined); };
    function onStorage(event: StorageEvent) {
      if (event.key !== key || !active()) return;
      const next = readOrdersCache(storeId);
      if (next) { orders = next.data; publish(); }
    }
    sync(); window.addEventListener('online', sync); window.addEventListener('focus', sync); window.addEventListener('storage', onStorage);
    return () => { controller.abort(); window.removeEventListener('online', sync); window.removeEventListener('focus', sync); window.removeEventListener('storage', onStorage); };
  }, [storeId, enabled, serverOrders]);
  return enabled && snapshot?.storeId === storeId ? snapshot.data : serverOrders;
}
