import { seed } from './admin.data';
import type { Store, WorkStatus } from './admin.types';

/** Retain historical prices and cancelled records while updating the demo workflow. */
export function migrateStore(store: Store): Store {
  const additions = seed().products.filter(p => ['comfort', 'dettol'].includes(p.id) && !store.products.some(existing => existing.id === p.id));
  return { ...store, employees: Array.isArray(store.employees) ? store.employees : [], products: [...store.products, ...additions], orders: store.orders.map(order => {
    const old = String(order.status);
    const status: WorkStatus = old === 'Completed' ? 'Completed' : ['In progress', 'In Progress', 'Ready'].includes(old) ? 'In Progress' : 'Pending';
    return { ...order, status, legacyCancelled: order.legacyCancelled || old === 'Cancelled' };
  }) };
}
