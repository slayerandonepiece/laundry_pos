import { NextRequest } from 'next/server';
import { listOrdersSince, parseSyncCursor } from '@/server/services/orders';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
  resolveOutletIdFromRequest,
} from '@/server/api/handler';
import { requireOutletSession, AuthError } from '@/server/auth/session';
import { ValidationError } from '@/server/errors';

export const runtime = 'nodejs';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const url = new URL(req.url);

    const sinceParam = url.searchParams.get('since');
    let cursor = null;
    if (sinceParam) {
      try {
        cursor = parseSyncCursor(sinceParam);
      } catch {
        throw new ValidationError('Invalid since cursor.');
      }
    }

    const limitParam = url.searchParams.get('limit');
    const parsedLimit = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    let outletId: string | undefined;
    if (session.storeRole === 'EMPLOYEE') {
      const requestedOutletId = resolveOutletIdFromRequest(req);
      if (!requestedOutletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, requestedOutletId, 'EMPLOYEE', session, { allowRestricted: true });
      outletId = requestedOutletId;
    } else {
      outletId = resolveOutletIdFromRequest(req);
    }

    const result = await listOrdersSince(session.storeId, cursor, limit, outletId);
    return jsonResponse(result);
  });
}
