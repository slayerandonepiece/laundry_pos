import { NextRequest } from 'next/server';
import { getExistingOrderInvoice, getOrCreateOrderInvoice } from '@/server/services/order-invoices';
import { getOrder } from '@/server/services/orders';
import { assertStoreWritable, requireOutletSession, AuthError } from '@/server/auth/session';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const { orderCode } = await params;

    const order = await getOrder(session.storeId, orderCode);
    if (!order) return jsonResponse({ error: 'Order not found.' }, 404);
    if (session.storeRole === 'EMPLOYEE') {
      if (!order.outletId) throw new AuthError('FORBIDDEN');
      await requireOutletSession(session.storeId, order.outletId, 'EMPLOYEE', session, { allowRestricted: true });
    }

    const existing = await getExistingOrderInvoice(session.storeId, orderCode);
    if (existing) return jsonResponse(existing);
    // Invoice allocation is a write even though this legacy endpoint is GET.
    // Restricted subscriptions may still read an existing invoice above.
    await assertStoreWritable(session.storeId);

    const invoice = await getOrCreateOrderInvoice(session.storeId, orderCode);
    return jsonResponse(invoice);
  });
}
