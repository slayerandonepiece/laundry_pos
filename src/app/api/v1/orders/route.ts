import { NextRequest } from 'next/server';
import { listOrders, createOrder } from '@/server/services/orders';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
  resolveOutletIdFromRequest,
} from '@/server/api/handler';
import { requireOutletSession, AuthError } from '@/server/auth/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
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

    let outletId: string | undefined;
    if (session.storeRole === 'EMPLOYEE') {
      const requestedOutletId = resolveOutletIdFromRequest(req);
      // Never silently fall back to a default outlet: employees must name the
      // active outlet for every operational read, preventing legacy/null data
      // from leaking into an outlet-scoped mobile cache.
      if (!requestedOutletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, requestedOutletId, 'EMPLOYEE', session, { allowRestricted: true });
      outletId = requestedOutletId;
    } else {
      outletId = resolveOutletIdFromRequest(req);
    }

    const orders = await listOrders(session.storeId, { limit, sort, outletId });
    return jsonResponse(orders);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const body = await req.json();

    let outletId: string | undefined;
    if (session.storeRole === 'EMPLOYEE') {
      const requestedOutletId = resolveOutletIdFromRequest(req) ?? (typeof body?.outletId === 'string' ? body.outletId : undefined);
      if (!requestedOutletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, requestedOutletId, 'EMPLOYEE', session);
      outletId = requestedOutletId;
    } else {
      outletId = resolveOutletIdFromRequest(req) ?? (typeof body?.outletId === 'string' ? body.outletId : undefined);
    }

    const order = await createOrder(session.storeId, body, session.id, outletId);
    return jsonResponse(order, 201);
  });
}
