import { NextRequest } from 'next/server';
import { getOrCreateOrderInvoice } from '@/server/services/order-invoices';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;

    const invoice = await getOrCreateOrderInvoice(session.storeId, orderCode);
    return jsonResponse(invoice);
  });
}
