import { dateLabel, paid, rangeFor, today, total, within } from './admin.data';
import type { DateRange, Expense, Order, Product } from './admin.types';

interface DashboardSource { orders: Order[]; expenses: Expense[]; products: Product[] }
export interface TrendPoint { label: string; amount: number }
export interface CashPoint { label: string; income: number; expenses: number }
export interface Breakdown { label: string; amount: number }
function intervals(range: DateRange, maximum: number) {
  const to = range.to < today() ? range.to : today();
  if (range.from > to) return [];
  const days = Math.round((Date.parse(to) - Date.parse(range.from)) / 86400000) + 1, step = Math.ceil(days / maximum);
  return Array.from({ length: Math.ceil(days / step) }, (_, index) => {
    const from = new Date(Date.parse(range.from) + index * step * 86400000).toISOString().slice(0, 10);
    const rawEnd = new Date(Date.parse(from) + (step - 1) * 86400000).toISOString().slice(0, 10), end = rawEnd > to ? to : rawEnd;
    return { from, to: end, label: from === end ? dateLabel(from) : `${dateLabel(from)}–${dateLabel(end)}` };
  });
}
export function dashboardData(store: DashboardSource, range: DateRange) {
  const current = today(), monthRange = rangeFor('month'), orders = store.orders.filter(order => within(order.date, range));
  const active = orders.filter(order => !order.legacyCancelled), payments = store.orders.flatMap(order => order.payments);
  const bars: TrendPoint[] = intervals(range, 12).map(interval => ({ label: interval.label, amount: active.filter(order => within(order.date, interval)).reduce((sum, order) => sum + total(order), 0) }));
  const cash: CashPoint[] = intervals(monthRange, 5).map(interval => ({ label: interval.label, income: payments.filter(payment => within(payment.date, interval)).reduce((sum, payment) => sum + payment.amount, 0), expenses: store.expenses.filter(expense => expense.paid && within(expense.paid, interval)).reduce((sum, expense) => sum + expense.amount, 0) }));
  const services = new Map(store.products.map(product => [product.id, { label: product.name, amount: 0 }]));
  active.flatMap(order => order.lines).forEach(line => {
    const entry = services.get(line.productId) ?? { label: line.name, amount: 0 };
    services.set(line.productId, { ...entry, amount: entry.amount + line.amount });
  });
  const serviceMix = [...services.values()].sort((a, b) => b.amount - a.amount);
  const pending = store.orders.filter(order => !order.legacyCancelled && order.status === 'Pending');
  const completedToday = store.orders.filter(order => order.status === 'Completed' && order.completed === current);
  const commitments = store.orders.filter(order => !order.legacyCancelled && order.status !== 'Completed').sort((a, b) => a.due.localeCompare(b.due));
  return {
    pendingCount: pending.length, pendingAmount: pending.reduce((sum, order) => sum + total(order), 0),
    completedAmount: completedToday.reduce((sum, order) => sum + total(order), 0),
    commitments, dueToday: commitments.filter(order => order.due === current).length,
    overdue: commitments.filter(order => order.due < current).length,
    todaySales: store.orders.filter(order => order.date === current && !order.legacyCancelled).reduce((sum, order) => sum + total(order), 0), todayCount: store.orders.filter(order => order.date === current && !order.legacyCancelled).length,
    todo: store.orders.filter(order => !order.legacyCancelled && order.status !== 'Completed').length, completed: store.orders.filter(order => order.completed === current && order.status === 'Completed').length,
    periodSales: active.reduce((sum, order) => sum + total(order), 0), periodOrders: active.length, outstanding: active.reduce((sum, order) => sum + total(order) - paid(order), 0),
    income: payments.filter(payment => within(payment.date, monthRange)).reduce((sum, payment) => sum + payment.amount, 0), expenses: store.expenses.filter(expense => expense.paid && within(expense.paid, monthRange)).reduce((sum, expense) => sum + expense.amount, 0), bars, cash, serviceMix,
    statuses: ['Pending', 'In Progress', 'Completed'].map(label => ({ label, amount: active.filter(order => order.status === label).length })),
    attention: store.orders.filter(order => !order.legacyCancelled && order.status !== 'Completed' && order.due <= current).sort((a, b) => a.due.localeCompare(b.due)),
    month: new Date(current + 'T12:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}
