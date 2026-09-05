import type { Product, Store, Order, DateRange } from './admin.types';
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const dateLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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
const item = (id: string, name: string, category: string, rupees: number): Product => ({ id, name, category, type: 'item', price: rupees * 100, active: true });
export function seed(): Store {
  const products: Product[] = [
    { id: 'wash', name: 'Wash, Dry & Fold', category: 'Laundry', type: 'weight', slabs: [{ limit: 4, price: 27900 }, { limit: 6, price: 37900 }], extra: 4900, active: true },
    item('iron', 'Steam ironing', 'Ironing', 11), item('shirt', 'Shirt / T-shirt / Pant', 'Dry cleaning', 59),
    item('jacket', 'Jacket', 'Dry cleaning', 149), item('blazer', 'Blazer', 'Dry cleaning', 189), item('saree', 'Saree', 'Dry cleaning', 188),
    item('blanket1', 'Single blanket', 'Home fabrics', 229), item('blanket2', 'Double blanket', 'Home fabrics', 279),
    item('sheet1', 'Single bed sheet', 'Home fabrics', 45), item('sheet2', 'Double bed sheet', 'Home fabrics', 69),
    { ...item('comfort', 'Comfort', 'Add-on', 18), active: false },
    { ...item('dettol', 'Dettol', 'Add-on', 19), active: false },
  ];
  const date = today(), month = date.slice(0, 7);
  const names = ['Ananya Rao', 'Rahul Mehta', 'Priya Sharma', 'Arjun Kumar', 'Sneha Reddy', 'Kiran Patel'];
  const orders: Order[] = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - Math.floor(i / 2));
    const day = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    const product = products[i % 10], qty = product.type === 'weight' ? 4 + i % 4 : 2 + i % 6;
    const amount = price(product, qty), status = (['Pending', 'In Progress', 'Completed', 'Completed'] as const)[i < 8 ? i % 4 : 3];
    return { id: 'EL-' + (1048 - i), name: names[i % 6], phone: '900000' + String(1000 + i), date: day, due: i < 4 ? date : day, status, completed: status === 'Completed' ? day : undefined, lines: [{ productId: product.id, name: product.name, quantity: qty, unit: product.type === 'weight' ? 'kg' : 'pcs', amount }], payments: i % 3 === 0 ? [] : [{ id: 'p' + i, amount: i % 3 === 1 ? Math.round(amount / 2) : amount, date: day, method: i % 2 ? 'UPI' : 'Cash' }], notes: '' };
  });
  return { products, orders, employees: [], expenses: [
    { id: 'e1', title: 'September shop rent', category: 'Shop rent', amount: 1200000, due: month + '-05', monthly: true },
    { id: 'e2', title: 'Detergent & packaging', category: 'Raw materials', amount: 245000, due: month + '-01', paid: month + '-01', monthly: false },
    { id: 'e3', title: 'Electricity bill', category: 'Electricity', amount: 318000, due: month + '-12', monthly: true },
    { id: 'e4', title: 'Team salaries', category: 'Salaries', amount: 1800000, due: month + '-28', monthly: true },
    { id: 'e5', title: 'Washer EMI', category: 'Machine EMI', amount: 650000, due: month + '-10', monthly: true },
  ], profile: { name: 'Store owner', phone: '9494930898', email: '', store: 'Express Laundry', address: 'Chinnappanahalli, Bengaluru' } };
}
