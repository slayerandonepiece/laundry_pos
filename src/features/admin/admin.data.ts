import type { Product, Order, DateRange, PaymentMethod } from './admin.types';
export const paymentMethodLabel = (method: PaymentMethod) => method === 'CASH' ? 'Cash' : method;
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const dateLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
// Same as dateLabel but with the year — for billing/subscription dates that
// span or approach a year boundary (annual coverage periods, paid-through
// dates), where the no-year short form reads as ambiguous or zero-length.
export const dateLabelFull = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const total = (o: Order) => o.lines.reduce((s, l) => s + l.amount, 0);
export const paid = (o: Order) => o.payments.reduce((s, p) => s + p.amount, 0);
export const paymentStatus = (o: Order) => total(o) === paid(o) ? 'Paid' : paid(o) ? 'Part-paid' : 'Unpaid';
export const within = (d: string, r: DateRange) => d >= r.from && d <= r.to;
export function price(p: Product, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (p.type === 'item') return Math.round(p.price * quantity);
  return p.slabs.find(s => quantity <= s.limit)?.price ?? Math.round(p.slabs.at(-1)!.price + (quantity - p.slabs.at(-1)!.limit) * p.extra);
}
export function rangeFor(period: string): DateRange {
  const end = today(), d = new Date(end + 'T12:00:00');
  if (period === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  else { d.setDate(1); if (period === 'quarter') d.setMonth(Math.floor(d.getMonth() / 3) * 3); }
  const finish = new Date(d);
  if (period === 'week') finish.setDate(finish.getDate() + 6);
  else { finish.setMonth(finish.getMonth() + (period === 'quarter' ? 3 : 1)); finish.setDate(0); }
  const format = (value: Date) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
  return { from: format(d), to: format(finish) };
}
