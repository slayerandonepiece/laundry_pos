import { NextRequest } from 'next/server';
import { listOrders, createOrder } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const orders = await listOrders(session.storeId);
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
