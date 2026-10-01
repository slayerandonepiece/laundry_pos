import { NextRequest } from 'next/server';
import { listOrders } from '@/server/services/orders';
import { listExpenses } from '@/server/services/expenses';
import { listProducts } from '@/server/services/products';
import { dashboardData, type DashboardGranularity } from '@/features/admin/admin.analytics';
import { rangeFor } from '@/features/admin/admin.data';
import type { DateRange } from '@/features/admin/admin.types';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { ValidationError } from '@/server/errors';
import { assertCalendarRange } from '@/server/dates';

// Day buckets are the finest granularity, so this also bounds bucket count (<= 366).
const MAX_DASHBOARD_RANGE_DAYS = 366;

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    if (from && to) assertCalendarRange(from, to, MAX_DASHBOARD_RANGE_DAYS);
    const outletId = req.nextUrl.searchParams.get('outletId') ?? undefined;
    const [orders, expenses, products] = await Promise.all([
      listOrders(session.storeId, { outletId }),
      listExpenses(session.storeId, { outletId }),
      listProducts(session.storeId),
    ]);

    const granularityParam = req.nextUrl.searchParams.get('granularity');
    let granularity: DashboardGranularity | undefined;
    if (granularityParam !== null) {
      if (granularityParam === 'day' || granularityParam === 'week' || granularityParam === 'month') {
        granularity = granularityParam;
      } else {
        throw new ValidationError('Invalid granularity. Expected day, week, or month.');
      }
    }

    const period = req.nextUrl.searchParams.get('period') ?? 'month';
    const range: DateRange = from && to ? { from, to } : rangeFor(period);

    const stats = dashboardData({ orders, expenses, products }, range, granularity);
    return jsonResponse(stats);
  });
}
