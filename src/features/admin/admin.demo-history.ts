import { price, seed } from './admin.data';
import type { Expense, Order, Store } from './admin.types';

const IMPORT = 'demo-jul-aug-2026-v1';
const months = ['2026-07', '2026-08'];
const names = ['Demo · Ananya', 'Demo · Rahul', 'Demo · Priya', 'Demo · Arjun', 'Demo · Sneha', 'Demo · Kiran'];

/** Fixed, labelled prototype history. Never overwrites existing business records. */
export function withDemoHistory(store: Store): Store {
  if (store.demoImports?.includes(IMPORT)) return store;
  // Use the photographed rate card, not user-edited prices, for these historical orders.
  const catalogue = seed().products;
  const services = catalogue.filter(product => product.active);
  const orders: Order[] = [];
  const expenses: Expense[] = [];
  months.forEach((month, monthIndex) => {
    for (let day = 1; day <= 31; day++) {
      const date = month + '-' + String(day).padStart(2, '0');
      const due = new Date(date + 'T12:00:00Z');
      due.setUTCDate(due.getUTCDate() + 1);
      const completed = due.toISOString().slice(0, 10);
      for (let n = 0; n < 8 + day % 4; n++) {
        const index = day * 11 + n + monthIndex * 37;
        const lines = [services[index % services.length], services[(index + 3) % services.length]].map((product, lineIndex) => {
          const quantity = product.type === 'weight' ? [3.456, 4, 5.25, 6, 7.125][index % 5] : 2 + (index + lineIndex) % 7;
          return { productId: product.id, name: product.name, quantity, unit: product.type === 'weight' ? 'kg' : 'pcs', amount: price(product, quantity) };
        });
        const id = 'DEMO-' + date.replaceAll('-', '') + '-' + String(n + 1).padStart(2, '0');
        orders.push({
          id, name: names[index % names.length], phone: '000000' + String(1000 + index % 9000),
          date, due: completed, completed, status: 'Completed', lines,
          payments: [{ id: id + '-payment', date, amount: lines.reduce((sum, line) => sum + line.amount, 0), method: index % 3 ? 'UPI' : 'Cash' }],
          notes: 'Synthetic demo order — not a real customer or transaction.',
          history: [
            { status: 'Pending', at: date + 'T09:00:00+05:30', by: 'Demo store team' },
            { status: 'In Progress', at: date + 'T12:00:00+05:30', by: 'Demo store team' },
            { status: 'Completed', at: completed + 'T10:00:00+05:30', by: 'Demo store team' },
          ],
        });
      }
    }
    const bills: { key: string; title: string; category: string; amount: number; day: number; monthly: boolean }[] = [
      { key: 'rent', title: 'Shop rent', category: 'Shop rent', amount: 12000, day: 5, monthly: true },
      { key: 'salary', title: 'Team salaries', category: 'Salaries', amount: 28000, day: 28, monthly: true },
      { key: 'electric', title: 'Electricity bill', category: 'Electricity', amount: monthIndex ? 6240 : 5480, day: 12, monthly: true },
      { key: 'emi', title: 'Washer EMI', category: 'Machine EMI', amount: 6500, day: 10, monthly: true },
      { key: 'gas', title: 'Gas cylinder refills', category: 'Gas cylinders', amount: monthIndex ? 5400 : 3600, day: 15, monthly: true },
      { key: 'supplies', title: 'Detergent, cleaning supplies & packaging', category: 'Raw materials', amount: monthIndex ? 7200 : 6400, day: 8, monthly: true },
      { key: 'water', title: 'Water supply', category: 'Other', amount: monthIndex ? 2100 : 1800, day: 18, monthly: true },
      { key: 'maintenance', title: 'Machine servicing & minor repairs', category: 'Other', amount: monthIndex ? 1500 : 2200, day: 20, monthly: false },
    ];
    for (const bill of bills) {
      // Continue an existing category's recurrence instead of introducing another rent/salary series.
      const existing = store.expenses.find(expense => expense.monthly && expense.category === bill.category && (bill.category !== 'Other' || expense.title.includes('Water')));
      const seriesId = existing?.seriesId || existing?.id.replace(/-\d{4}-\d{2}$/, '') || 'demo-' + bill.key;
      if (store.expenses.some(expense => expense.due.startsWith(month) && (expense.seriesId === seriesId || expense.id === existing?.id))) continue;
      const due = month + '-' + String(bill.day).padStart(2, '0');
      expenses.push({ id: 'DEMO-EXP-' + bill.key + '-' + month, title: 'Demo · ' + bill.title, category: bill.category, amount: bill.amount * 100, due, paid: due, monthly: bill.monthly, seriesId: bill.monthly ? seriesId : undefined, dueDay: bill.day });
    }
  });
  return {
    ...store, demoImports: [...(store.demoImports || []), IMPORT],
    products: [...store.products, ...catalogue.filter(product => !store.products.some(existing => existing.id === product.id))],
    orders: [...store.orders, ...orders.filter(order => !store.orders.some(existing => existing.id === order.id))].sort((a, b) => b.date.localeCompare(a.date)),
    expenses: [...store.expenses, ...expenses.filter(expense => !store.expenses.some(existing => existing.id === expense.id))],
  };
}
