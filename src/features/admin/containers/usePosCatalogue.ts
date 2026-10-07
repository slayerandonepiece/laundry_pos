'use client';

import { useEffect, useState } from 'react';
import type { Product, PaymentMethodOption } from '../admin.types';
import { CATALOGUE_TTL, cacheGeneration, isFresh, isPaymentMethod, isProduct, readListCache, withCacheLock, writeCache } from '../client-cache';

export function usePosCatalogue(storeId: string | undefined, enabled: boolean, serverProducts: Product[], serverMethods: PaymentMethodOption[]) {
  const [snapshot, setSnapshot] = useState<{ storeId: string; products: Product[]; methods: PaymentMethodOption[] } | null>(null);
  useEffect(() => {
    if (!enabled || !storeId) return;
    const catalogueKey = `el-catalogue-${storeId}`, methodsKey = `el-payment-methods-${storeId}`;
    const controller = new AbortController(), generation = cacheGeneration();
    let products = readListCache(catalogueKey, isProduct), methods = readListCache(methodsKey, isPaymentMethod);
    let currentProducts = products && (isFresh(products.cachedAt, CATALOGUE_TTL) || !navigator.onLine) ? products.data : serverProducts;
    // Payment methods and their stage are set by Super Admin, so the server's list wins on every load; the cache is only an offline fallback.
    let currentMethods = methods && !navigator.onLine ? methods.data : serverMethods;
    const active = () => !controller.signal.aborted && generation === cacheGeneration();
    const publish = () => { if (active()) setSnapshot({ storeId, products: currentProducts, methods: currentMethods }); };
    publish();
    async function refresh() {
      if (!navigator.onLine || !active()) return;
      await withCacheLock(`el-catalogue-sync-${storeId}`, controller.signal, async () => {
        if (!active()) return;
        products = readListCache(catalogueKey, isProduct); methods = readListCache(methodsKey, isPaymentMethod);
        const options = { headers: { 'X-Store-Id': storeId! }, signal: controller.signal };
        let version: string | null | undefined;
        try {
          const status = await fetch('/api/v1/sync/status', { ...options, cache: 'no-store' });
          if (status.ok) version = (await status.json()).productsUpdatedAt;
          else if (status.status === 401 || status.status === 403) return;
        } catch { if (!active()) return; }
        await Promise.allSettled([
          (async () => {
            if (products && isFresh(products.cachedAt, CATALOGUE_TTL) && (version === undefined || products.version === version)) { currentProducts = products.data; return; }
            const response = await fetch('/api/v1/products', { ...options, cache: 'no-cache' });
            if (!response.ok) return;
            const data: unknown = await response.json();
            if (!Array.isArray(data) || !data.every(isProduct) || !active()) return;
            currentProducts = data;
            writeCache(catalogueKey, { data, cachedAt: Date.now(), version });
          })(),
          (async () => {
            const response = await fetch('/api/v1/payment-methods', { ...options, cache: 'no-cache' });
            if (!response.ok) return;
            const raw: unknown = await response.json();
            if (!Array.isArray(raw) || !active()) return;
            const data = raw.filter(method => method?.enabled === true).map(method => ({ id: method.id, name: method.name, code: method.code, stage: method.stage, active: true }));
            if (!data.every(isPaymentMethod)) return;
            currentMethods = data;
            writeCache(methodsKey, { data, cachedAt: Date.now() });
          })(),
        ]);
        publish();
      });
    }
    const sync = () => { void refresh().catch(() => undefined); };
    function onStorage(event: StorageEvent) {
      if (event.key === catalogueKey || event.key === methodsKey) {
        products = readListCache(catalogueKey, isProduct); methods = readListCache(methodsKey, isPaymentMethod);
        currentProducts = products?.data ?? serverProducts; currentMethods = methods?.data ?? serverMethods;
        publish();
      }
    }
    sync(); window.addEventListener('online', sync); window.addEventListener('focus', sync); window.addEventListener('storage', onStorage);
    return () => { controller.abort(); window.removeEventListener('online', sync); window.removeEventListener('focus', sync); window.removeEventListener('storage', onStorage); };
  }, [storeId, enabled, serverProducts, serverMethods]);
  return enabled && snapshot && snapshot.storeId === storeId ? snapshot : { products: serverProducts, methods: serverMethods };
}
