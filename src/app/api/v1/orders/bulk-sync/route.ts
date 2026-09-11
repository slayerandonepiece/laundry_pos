import { NextRequest } from 'next/server';
import { bulkSyncOrders, bulkSyncRequestSchema } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const body = await req.json();
    const { actions } = bulkSyncRequestSchema.parse(body);
    const results = await bulkSyncOrders(session.storeId, actions, session.id);
    return jsonResponse({ results });
  });
}
