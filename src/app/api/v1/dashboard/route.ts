import { NextRequest } from 'next/server';
import { listOrders } from '@/server/services/orders';
import { listExpenses } from '@/server/services/expenses';
import { listProducts } from '@/server/services/products';
import { dashboardData } from '@/features/admin/admin.analytics';
import { rangeFor } from '@/features/admin/admin.data';
import type { DateRange } from '@/features/admin/admin.types';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const outletId = req.nextUrl.searchParams.get('outletId') ?? undefined;
    const [orders, expenses, products] = await Promise.all([
      listOrders(session.storeId, { outletId }),
      listExpenses(session.storeId, { outletId }),
      listProducts(session.storeId),
    ]);

    const period = req.nextUrl.searchParams.get('period') ?? 'month';
    const from = req.nextUrl.searchParams.get('from');
    const to = req.nextUrl.searchParams.get('to');
    const range: DateRange = from && to ? { from, to } : rangeFor(period);

    const stats = dashboardData({ orders, expenses, products }, range);
    return jsonResponse(stats);
  });
}
