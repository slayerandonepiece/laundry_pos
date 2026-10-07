import { NextRequest } from 'next/server';
import { z } from 'zod';
import { deliverOrderWithPayment, getOrder } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { requireOutletSession, AuthError } from '@/server/auth/session';

export const runtime = 'nodejs';

// Collects the outstanding balance (when there is one) and marks the order
// delivered in one transaction. PATCH /status to Delivered is refused while a
// balance is due; this is the call that pays and delivers together.
const deliverSchema = z.object({
  amount: z.number().int().positive('Payment must be a positive amount').optional(),
  method: z.string().trim().min(1, 'Payment method is required').optional(),
  clientActionId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    const body = await req.json().catch(() => ({}));
    const input = deliverSchema.parse(body);

    if (session.storeRole === 'EMPLOYEE') {
      const order = await getOrder(session.storeId, orderCode);
      if (!order) return jsonResponse({ error: 'Order not found.' }, 404);
      if (!order.outletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, order.outletId, 'EMPLOYEE', session);
    }

    return jsonResponse(await deliverOrderWithPayment(session.storeId, orderCode, input, session.id));
  });
}
