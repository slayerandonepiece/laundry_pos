import { rangeFor } from './admin.data';
import type { WorkStatus } from './admin.types';

/** Sales register filters as they appear in the /admin/sales query string. */
export const SALES_PERIODS = ['week', 'month', 'quarter', 'custom'] as const;
export const SALES_WORK = ['Pending', 'In Progress', 'Ready', 'Delivered'] as const satisfies readonly WorkStatus[];
export const SALES_PAY = ['Unpaid', 'Part-paid', 'Paid'] as const;
export const SALES_PAGE_SIZES = [10, 25, 50, 100] as const;
export const SALES_DEFAULT_PERIOD = 'week';
export const SALES_DEFAULT_SIZE = 25;

export type SalesPeriod = typeof SALES_PERIODS[number];
export type SalesPay = typeof SALES_PAY[number];
/** today/late come from the toggles; attention is the dashboard's "due today & overdue" link. */
export type SalesDue = 'today' | 'late' | 'attention';

export interface SalesQuery {
  period: SalesPeriod; from: string; to: string;
  q: string; work: WorkStatus | ''; pay: SalesPay | ''; due: SalesDue | '';
  page: number; size: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().startsWith(value);

/** Read the register filters from the URL; anything missing or invalid falls back to the default. */
export function parseSalesParams(params: Params): SalesQuery {
  let period = one(params.period) as SalesPeriod;
  if (!SALES_PERIODS.includes(period)) period = SALES_DEFAULT_PERIOD;
  let { from, to } = period === 'custom' ? { from: one(params.from), to: one(params.to) } : rangeFor(period);
  if (period === 'custom' && !(isDate(from) && isDate(to) && from <= to)) { period = SALES_DEFAULT_PERIOD; ({ from, to } = rangeFor(period)); }
  const work = one(params.work) as WorkStatus;
  const pay = one(params.pay) as SalesPay;
  const dueParam = one(params.due);
  const due: SalesDue | '' = dueParam === 'today' || dueParam === 'late' ? dueParam : one(params.attention) === '1' ? 'attention' : '';
  const size = Number(one(params.size));
  const page = Number(one(params.page));
  return {
    period, from, to,
    q: one(params.q).trim().slice(0, 100),
    work: SALES_WORK.includes(work as typeof SALES_WORK[number]) ? work : '',
    pay: SALES_PAY.includes(pay) ? pay : '',
    due,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (SALES_PAGE_SIZES as readonly number[]).includes(size) ? size : SALES_DEFAULT_SIZE,
  };
}

/**
 * The browser's last chosen period, kept in a cookie (not localStorage) so the
 * server renders the same period the client shows: no flash of another period.
 * Applies only when the URL names no period.
 */
export const SALES_PERIOD_COOKIE = 'el_sales_period';
export function encodeSalesPeriod(period: SalesPeriod, from: string, to: string): string {
  return period === 'custom' ? `custom~${from}~${to}` : period;
}
export function decodeSalesPeriod(value: string | undefined): Params {
  const [period, from, to] = (value ?? '').split('~');
  return period === 'custom' ? { period, from, to } : { period };
}

/** Build the /admin/sales URL for a set of filters; defaults are left out to keep links short. */
export function salesHref(query: SalesQuery): string {
  const params = new URLSearchParams();
  params.set('period', query.period);
  if (query.period === 'custom') { params.set('from', query.from); params.set('to', query.to); }
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.work) params.set('work', query.work);
  if (query.pay) params.set('pay', query.pay);
  if (query.due === 'attention') params.set('attention', '1');
  else if (query.due) params.set('due', query.due);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.size !== SALES_DEFAULT_SIZE) params.set('size', String(query.size));
  return `/admin/sales?${params}`;
}
