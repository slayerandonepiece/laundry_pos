import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { getOrCreateOrderInvoice } from '@/server/services/order-invoices';
import { OrderInvoicePdf } from '@/features/admin/pdf/OrderInvoicePdf';
import { handleApiRoute, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;

    const invoice = await getOrCreateOrderInvoice(session.storeId, orderCode);
    return invoicePdfResponse(<OrderInvoicePdf invoice={invoice} />, invoice.invoiceSeq, req.nextUrl.searchParams.get('download') === '1');
  });
}
