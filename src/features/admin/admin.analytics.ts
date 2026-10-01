import { dateLabel, paid, rangeFor, today, total, within } from "./admin.data";
import type { DateRange, Expense, Order, Product } from "./admin.types";

interface DashboardSource {
  orders: Order[];
  expenses: Expense[];
  products: Product[];
}
export interface TrendPoint {
  label: string;
  amount: number;
}
export interface CashPoint {
  label: string;
  income: number;
  expenses: number;
}
export interface Breakdown {
  label: string;
  amount: number;
}
export type DashboardGranularity = 'day' | 'week' | 'month';

function addDaysToYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const resY = date.getUTCFullYear();
  const resM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const resD = String(date.getUTCDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
}

function getDayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.getUTCDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
}

export function granularIntervals(range: DateRange, granularity: DashboardGranularity) {
  const to = range.to < today() ? range.to : today();
  if (range.from > to) return [];

  const buckets: { from: string; to: string; label: string }[] = [];

  if (granularity === 'day') {
    let curr = range.from;
    while (curr <= to) {
      buckets.push({
        from: curr,
        to: curr,
        label: dateLabel(curr),
      });
      curr = addDaysToYMD(curr, 1);
    }
  } else if (granularity === 'week') {
    let curr = range.from;
    while (curr <= to) {
      const dow = getDayOfWeek(curr);
      const daysToSunday = dow === 0 ? 0 : 7 - dow;
      const sunday = addDaysToYMD(curr, daysToSunday);
      const end = sunday > to ? to : sunday;
      buckets.push({
        from: curr,
        to: end,
        label: curr === end ? dateLabel(curr) : `${dateLabel(curr)}–${dateLabel(end)}`,
      });
      curr = addDaysToYMD(sunday, 1);
    }
  } else if (granularity === 'month') {
    let curr = range.from;
    while (curr <= to) {
      const [y, m] = curr.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const end = monthEnd > to ? to : monthEnd;
      buckets.push({
        from: curr,
        to: end,
        label: curr === end ? dateLabel(curr) : `${dateLabel(curr)}–${dateLabel(end)}`,
      });
      const nextY = m === 12 ? y + 1 : y;
      const nextM = m === 12 ? 1 : m + 1;
      curr = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    }
  }

  return buckets;
}

function intervals(range: DateRange, maximum: number) {
  const to = range.to < today() ? range.to : today();
  if (range.from > to) return [];
  const days =
      Math.round((Date.parse(to) - Date.parse(range.from)) / 86400000) + 1,
    step = Math.ceil(days / maximum);
  return Array.from({ length: Math.ceil(days / step) }, (_, index) => {
    const from = new Date(Date.parse(range.from) + index * step * 86400000)
      .toISOString()
      .slice(0, 10);
    const rawEnd = new Date(Date.parse(from) + (step - 1) * 86400000)
        .toISOString()
        .slice(0, 10),
      end = rawEnd > to ? to : rawEnd;
    return {
      from,
      to: end,
      label:
        from === end ? dateLabel(from) : `${dateLabel(from)}–${dateLabel(end)}`,
    };
  });
}
export function dashboardData(store: DashboardSource, range: DateRange, granularity?: DashboardGranularity) {
  const current = today(),
    monthRange = rangeFor("month"),
    orders = store.orders.filter((order) => within(order.date, range));
  const active = orders.filter((order) => !order.legacyCancelled),
    payments = store.orders.flatMap((order) => order.payments);
  const rangeIntervals = granularity ? granularIntervals(range, granularity) : intervals(range, 12);
  const bars: TrendPoint[] = rangeIntervals.map((interval) => ({
    label: interval.label,
    amount: active
      .filter((order) => within(order.date, interval))
      .reduce((sum, order) => sum + total(order), 0),
  }));
  const cash: CashPoint[] = intervals(monthRange, 5).map((interval) => ({
    label: interval.label,
    income: payments
      .filter((payment) => within(payment.date, interval))
      .reduce((sum, payment) => sum + payment.amount, 0),
    expenses: store.expenses
      .filter((expense) => expense.paid && within(expense.paid, interval))
      .reduce((sum, expense) => sum + expense.amount, 0),
  }));
  const cashRange: CashPoint[] | undefined = granularity
    ? rangeIntervals.map((interval) => ({
        label: interval.label,
        income: payments
          .filter((payment) => within(payment.date, interval))
          .reduce((sum, payment) => sum + payment.amount, 0),
        expenses: store.expenses
          .filter((expense) => expense.paid && within(expense.paid, interval))
          .reduce((sum, expense) => sum + expense.amount, 0),
      }))
    : undefined;
  const services = new Map(
    store.products.map((product) => [
      product.id,
      { label: product.name, amount: 0 },
    ]),
  );
  active
    .flatMap((order) => order.lines)
    .forEach((line) => {
      const entry = services.get(line.productId) ?? {
        label: line.name,
        amount: 0,
      };
      services.set(line.productId, {
        ...entry,
        amount: entry.amount + line.amount,
      });
    });
  const serviceMix = [...services.values()].sort((a, b) => b.amount - a.amount);
  const isDelivered = (s: string) => s === "Delivered" || s === "Completed";
  const pending = store.orders.filter(
    (order) => !order.legacyCancelled && order.status === "Pending",
  );
  const completedToday = store.orders.filter(
    (order) => isDelivered(order.status) && order.completed === current,
  );
  const commitments = store.orders
    .filter((order) => !order.legacyCancelled && !isDelivered(order.status))
    .sort((a, b) => a.due.localeCompare(b.due));
  return {
    pendingCount: pending.length,
    pendingAmount: pending.reduce((sum, order) => sum + total(order), 0),
    completedAmount: completedToday.reduce(
      (sum, order) => sum + total(order),
      0,
    ),
    commitments,
    dueToday: commitments.filter((order) => order.due === current).length,
    overdue: commitments.filter((order) => order.due < current).length,
    todaySales: store.orders
      .filter((order) => order.date === current && !order.legacyCancelled)
      .reduce((sum, order) => sum + total(order), 0),
    todayCount: store.orders.filter(
      (order) => order.date === current && !order.legacyCancelled,
    ).length,
    todo: store.orders.filter(
      (order) => !order.legacyCancelled && !isDelivered(order.status),
    ).length,
    completed: store.orders.filter(
      (order) => order.completed === current && isDelivered(order.status),
    ).length,
    periodSales: active.reduce((sum, order) => sum + total(order), 0),
    periodOrders: active.length,
    outstanding: active.reduce(
      (sum, order) => sum + total(order) - paid(order),
      0,
    ),
    income: payments
      .filter((payment) => within(payment.date, monthRange))
      .reduce((sum, payment) => sum + payment.amount, 0),
    expenses: store.expenses
      .filter((expense) => expense.paid && within(expense.paid, monthRange))
      .reduce((sum, expense) => sum + expense.amount, 0),
    bars,
    cash,
    ...(cashRange !== undefined ? { cashRange } : {}),
    serviceMix,
    statuses: (["Pending", "In Progress", "Ready", "Delivered"] as const).map(
      (label) => ({
        label,
        amount: active.filter((order) => order.status === label).length,
      }),
    ),
    attention: store.orders
      .filter(
        (order) =>
          !order.legacyCancelled &&
          !isDelivered(order.status) &&
          order.due <= current,
      )
      .sort((a, b) => a.due.localeCompare(b.due)),
    month: new Date(current + "T12:00:00").toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    }),
  };
}
