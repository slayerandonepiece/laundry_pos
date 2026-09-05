import type { Expense, Store } from './admin.types';
import { today } from './admin.data';

/** Extend monthly demo series through next month without rewriting paid occurrences. */
export function withRecurringExpenses(store: Store, currentDate = today()): Store {
  const horizon = new Date(currentDate + 'T12:00:00Z');
  horizon.setUTCDate(1);
  horizon.setUTCMonth(horizon.getUTCMonth() + 1);
  const lastMonth = horizon.toISOString().slice(0, 7);
  const expenses = store.expenses.map(e => e.monthly ? {
    ...e, seriesId: e.seriesId || e.id.replace(/-\d{4}-\d{2}$/, ''),
    dueDay: e.dueDay || Number(e.due.slice(-2)),
  } : e);
  const series = new Map<string, Expense[]>();
  for (const expense of expenses) {
    if (!expense.monthly || !expense.seriesId) continue;
    const list = series.get(expense.seriesId) || [];
    list.push(expense); series.set(expense.seriesId, list);
  }
  for (const [id, rows] of series) {
    rows.sort((a, b) => a.due.localeCompare(b.due));
    const first = rows[0], template = rows.at(-1)!;
    const occupied = new Set(rows.map(e => e.due.slice(0, 7)));
    const cursor = new Date(first.due.slice(0, 7) + '-01T12:00:00Z');
    const dueDay = first.dueDay!;
    while (cursor.toISOString().slice(0, 7) <= lastMonth) {
      const month = cursor.toISOString().slice(0, 7);
      if (!occupied.has(month)) {
        const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
        expenses.push({ ...template, id: id + '-' + month, seriesId: id, dueDay,
          due: month + '-' + String(Math.min(dueDay, last)).padStart(2, '0'), paid: undefined });
        occupied.add(month);
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return { ...store, expenses };
}
