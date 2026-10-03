import type { Order, Product, StorePaymentMethod } from './admin.types';

export const SESSION_KEY = 'express-laundry-admin-v1-session';
export const CATALOGUE_TTL = 5 * 60 * 1000;
export const ORDERS_TTL = 60 * 1000;
export interface ListCache<T> { data: T[]; cachedAt: number; version?: string | null }
export interface OrdersCache extends ListCache<Order> { lastSyncAt: string | null; complete?: boolean }
let generation = 0;
export const cacheGeneration = () => generation;

export const isProduct = (value: unknown): value is Product => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Product;
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.category === 'string' && typeof p.active === 'boolean' &&
    (p.type === 'item' ? Number.isFinite(p.price) : p.type === 'weight' && Array.isArray(p.slabs) && Number.isFinite(p.extra) && p.slabs.every(s => s && Number.isFinite(s.limit) && Number.isFinite(s.price)));
};
export const isPaymentMethod = (value: unknown): value is StorePaymentMethod => !!value && typeof value === 'object' && typeof (value as StorePaymentMethod).id === 'string' && typeof (value as StorePaymentMethod).name === 'string' && typeof (value as StorePaymentMethod).active === 'boolean';
export const isOrder = (value: unknown): value is Order => {
  if (!value || typeof value !== 'object') return false;
  const o = value as Order;
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.phone === 'string' && typeof o.date === 'string' && typeof o.due === 'string' && typeof o.notes === 'string' && ['Pending', 'In Progress', 'Ready', 'Delivered'].includes(o.status) && Array.isArray(o.lines) && o.lines.every(l => l && typeof l.productId === 'string' && typeof l.name === 'string' && typeof l.unit === 'string' && Number.isFinite(l.quantity) && Number.isFinite(l.amount)) && Array.isArray(o.payments) && o.payments.every(p => p && typeof p.id === 'string' && typeof p.date === 'string' && typeof p.method === 'string' && Number.isFinite(p.amount)) && (o.history === undefined || (Array.isArray(o.history) && o.history.every(event => event && typeof event.status === 'string' && typeof event.at === 'string' && typeof event.by === 'string')));
};

export function readListCache<T>(key: string, valid: (value: unknown) => value is T): ListCache<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!Number.isFinite(value.cachedAt) || !Array.isArray(value.data) || !value.data.every(valid)) return null;
    return value;
  } catch { return null; }
}
export function writeCache(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* SSR and unavailable storage keep in-memory state usable. */ }
}
export function isFresh(cachedAt: number, ttl: number): boolean {
  const age = Date.now() - cachedAt;
  return age >= 0 && age < ttl;
}
export function clearClientCaches(): void {
  generation += 1;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key && /^(el-catalogue-|el-payment-methods-|el-orders-cache-)/.test(key)) localStorage.removeItem(key);
  } catch { /* Storage is optional. */ }
}
export function watchSessionMirror(onRemoved: () => void, onUpdated: () => void): () => void {
  function onStorage(event: StorageEvent) {
    try { if (event.storageArea && event.storageArea !== localStorage) return; } catch { return; }
    if ((event.key === SESSION_KEY && !event.newValue) || event.key === null) {
      clearClientCaches();
      onRemoved();
    } else if (event.key === SESSION_KEY) onUpdated();
  }
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
export function readOrdersCache(storeId: string): OrdersCache | null {
  const value = readListCache(`el-orders-cache-${storeId}`, isOrder) as OrdersCache | null;
  if (!value || (value.complete !== undefined && typeof value.complete !== 'boolean') || (value.lastSyncAt !== null && (typeof value.lastSyncAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.lastSyncAt) || !Number.isFinite(Date.parse(value.lastSyncAt))))) return null;
  return value;
}
export function mergeOrders(orders: Order[], delta: (Order & { deleted?: boolean })[]): Order[] {
  const map = new Map(orders.filter(order => !order.legacyCancelled).map(order => [order.id, order]));
  for (const order of delta) {
    if (order.deleted || order.legacyCancelled) map.delete(order.id);
    else map.set(order.id, order);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, undefined, { numeric: true }));
}
export function cacheCreatedOrder(storeId: string, order: Order): void {
  if (!storeId) return;
  const previous = readOrdersCache(storeId);
  writeCache(`el-orders-cache-${storeId}`, { data: mergeOrders(previous?.data ?? [], [order]), cachedAt: Date.now(), lastSyncAt: previous?.lastSyncAt ?? null, complete: previous?.complete ?? false });
}

export async function withCacheLock<T>(key: string, signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, { signal }, action);
  return action();
}
