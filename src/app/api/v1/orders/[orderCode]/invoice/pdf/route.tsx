import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { assertCanReadOrderInvoice, getOrCreateOrderInvoice } from '@/server/services/order-invoices';
import { OrderInvoicePdf } from '@/features/admin/pdf/OrderInvoicePdf';
import { handleApiRoute, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;

    // Same outlet rule as GET /orders/{code}/invoice: an employee reads only
    // their own outlets' orders.
    await assertCanReadOrderInvoice(session, orderCode);
    const invoice = await getOrCreateOrderInvoice(session.storeId, orderCode);
    return invoicePdfResponse(<OrderInvoicePdf invoice={invoice} />, invoice.invoiceNumber, req.nextUrl.searchParams.get('download') === '1');
  });
}
