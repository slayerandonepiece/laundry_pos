import { NextRequest } from 'next/server';
import { listOrders, createOrder } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const searchParams = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
    const limitParam = searchParams.get('limit');
    const sortParam = searchParams.get('sort');

    let limit: number | undefined;
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = Math.min(Math.max(parsed, 1), 100);
      }
    }

    const sort = sortParam === 'recent' ? 'recent' : 'default';

    const orders = await listOrders(session.storeId, { limit, sort });
    return jsonResponse(orders);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const body = await req.json();
    const order = await createOrder(session.storeId, body, session.id);
    return jsonResponse(order, 201);
  });
}
