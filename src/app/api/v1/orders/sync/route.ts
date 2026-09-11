import { NextRequest } from 'next/server';
import { listOrdersSince, parseSyncCursor } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { ValidationError } from '@/server/errors';

export const runtime = 'nodejs';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
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

    const result = await listOrdersSince(session.storeId, cursor, limit);
    return jsonResponse(result);
  });
}
