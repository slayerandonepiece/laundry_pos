import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { assertCanReadOrderInvoice } from '@/server/services/order-invoices';
import { getOrCreateOrderSlip } from '@/server/services/order-slips';
import { OrderSlipPdf } from '@/features/admin/pdf/OrderSlipPdf';
import { handleApiRoute, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    await assertCanReadOrderInvoice(session, orderCode);
    const slip = await getOrCreateOrderSlip(session.storeId, orderCode);
    return invoicePdfResponse(<OrderSlipPdf slip={slip} />, `Order ${slip.orderCode}`, req.nextUrl.searchParams.get('download') === '1');
  });
}
