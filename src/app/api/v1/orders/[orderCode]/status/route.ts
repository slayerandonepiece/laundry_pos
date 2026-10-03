import { NextRequest } from 'next/server';
import { z } from 'zod';
import { updateOrderStatus, getOrder } from '@/server/services/orders';
import type { WorkStatus } from '@/features/admin/admin.types';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { requireOutletSession, AuthError } from '@/server/auth/session';

export const runtime = 'nodejs';

const statusSchema = z.object({
  status: z.custom<WorkStatus>(val => typeof val === 'string' && val.trim().length > 0, 'Status is required'),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    const body = await req.json();
    const { status } = statusSchema.parse(body);

    if (session.storeRole === 'EMPLOYEE') {
      const order = await getOrder(session.storeId, orderCode);
      if (!order) {
        return jsonResponse({ error: 'Order not found.' }, 404);
      }
      if (!order.outletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, order.outletId, 'EMPLOYEE', session);
    }

    const updated = await updateOrderStatus(session.storeId, orderCode, status, session.id);
    return jsonResponse(updated);
  });
}
