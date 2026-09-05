import { paid, price, seed } from './admin.data';
import type { Order, Store } from './admin.types';

const IMPORT = 'demo-september-income-2026-v1';

/** One-time synthetic September history; accounting calculations remain unchanged. */
export function withSeptemberDemoIncome(store: Store): Store {
  if (store.demoImports?.includes(IMPORT)) return store;
  const services = seed().products.filter(product => product.active);
  const existingIncome = store.orders.reduce((sum, order) => sum + order.payments.filter(payment => payment.date.startsWith('2026-09')).reduce((amount, payment) => amount + payment.amount, 0), 0);
  const monthExpenses = store.expenses.filter(expense => expense.due.startsWith('2026-09') || expense.paid?.startsWith('2026-09')).reduce((sum, expense) => sum + expense.amount, 0);
  const target = Math.max(20000000, Math.ceil(monthExpenses * 1.5) + 10000000);
  const orders: Order[] = [];
  let income = existingIncome;
  const existingIds = new Set(store.orders.map(order => order.id));
  for (let index = 0; index < 150 || income < target; index++) {
    const date = '2026-09-0' + (index % 5 + 1);
    const id = 'DEMO-SEP-INCOME-' + String(index + 1).padStart(4, '0');
    if (existingIds.has(id)) continue;
    const lines = [services[index % services.length], services[(index + 4) % services.length]].map((product, offset) => {
      const quantity = product.type === 'weight' ? [4, 5.125, 6, 7.456][index % 4] : 4 + (index + offset) % 8;
      return { productId: product.id, name: product.name, quantity, unit: product.type === 'weight' ? 'kg' : 'pcs', amount: price(product, quantity) };
    });
    const amount = lines.reduce((sum, line) => sum + line.amount, 0);
    const status = date === '2026-09-05' ? (['Pending', 'In Progress', 'Completed'] as const)[index % 3] : 'Completed';
    const order: Order = {
      id, date, name: 'Demo · Customer ' + (index + 1), phone: '000000' + String(1000 + index),
      due: date, completed: status === 'Completed' ? date : undefined, status, lines,
      payments: [{ id: id + '-payment', date, amount, method: index % 3 ? 'UPI' : 'Cash' }],
      notes: 'Synthetic demo order and payment — not a real transaction.',
      history: [{ status: 'Pending', at: date + 'T08:00:00+05:30', by: 'Demo store team' },
        ...(status !== 'Pending' ? [{ status: 'In Progress' as const, at: date + 'T09:00:00+05:30', by: 'Demo store team' }] : []),
        ...(status === 'Completed' ? [{ status: 'Completed' as const, at: date + 'T10:00:00+05:30', by: 'Demo store team' }] : [])],
    };
    orders.push(order);
    income += paid(order);
  }
  return { ...store, demoImports: [...(store.demoImports || []), IMPORT], orders: [...store.orders, ...orders].sort((a, b) => b.date.localeCompare(a.date)) };
}
