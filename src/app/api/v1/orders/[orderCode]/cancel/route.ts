import { NextRequest } from 'next/server';
import { z } from 'zod';
import { cancelOrder } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

// Owner-only. Cancels an order that has not been delivered; Delivered is final.
// A cancelled order leaves GET /orders and comes back from /orders/sync with
// `deleted: true` so devices drop it. Money already collected is not refunded here.
const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Reason must be at least 3 characters.').max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { orderCode } = await params;
    const { reason } = cancelSchema.parse(await req.json().catch(() => ({})));
    await cancelOrder(session.storeId, orderCode, session.id, reason);
    return jsonResponse({ ok: true });
  });
}
