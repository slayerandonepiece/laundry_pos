import { NextRequest } from 'next/server';
import { bulkSyncOrders, bulkSyncRequestSchema } from '@/server/services/orders';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
  resolveOutletIdFromRequest,
} from '@/server/api/handler';
import { requireOutletSession, AuthError } from '@/server/auth/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const body = await req.json();
    const { actions } = bulkSyncRequestSchema.parse(body);

    let defaultOutletId: string | undefined;
    let authorizeOrderOutlet: ((outletId: string | null) => Promise<boolean>) | undefined;
    if (session.storeRole === 'EMPLOYEE') {
      const requestedOutletId = resolveOutletIdFromRequest(req);
      if (!requestedOutletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, requestedOutletId, 'EMPLOYEE', session);
      defaultOutletId = requestedOutletId;

      for (const action of actions) {
        if (action.type === 'create_order') {
          if (action.payload.outletId && action.payload.outletId !== defaultOutletId) {
            throw new AuthError('FORBIDDEN');
          }
        }
      }

      // Same rule as PATCH /orders/{code}/status and POST /orders/{code}/payments.
      authorizeOrderOutlet = async (outletId) => {
        if (!outletId) return false;
        try {
          await requireOutletSession(session.storeId, outletId, 'EMPLOYEE', session);
          return true;
        } catch (err) {
          if (err instanceof AuthError) return false;
          throw err;
        }
      };
    } else {
      defaultOutletId = resolveOutletIdFromRequest(req);
    }

    const results = await bulkSyncOrders(session.storeId, actions, session.id, defaultOutletId, authorizeOrderOutlet);
    return jsonResponse({ results });
  });
}
