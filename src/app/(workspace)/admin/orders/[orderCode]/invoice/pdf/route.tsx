import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { getOrCreateOrderInvoice } from '@/server/services/order-invoices';
import { OrderInvoicePdf } from '@/features/admin/pdf/OrderInvoicePdf';

// @react-pdf/renderer needs a real Node runtime, not the edge runtime —
// same requirement as the subscription invoice route.
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;

  let storeId: string;
  try {
    // No role restriction: any signed-in member of the order's store (owner
    // or employee) can view/print/download/share the order's invoice,
    // matching today's order-detail access.
    const storeSelection = await resolveStoreSelection();
    const session = await requireStoreSession(storeSelection?.multiStore ? storeSelection.storeId : undefined);
    storeId = session.storeId;
  } catch (error) {
    if (error instanceof AuthError) return new Response('Unauthorized', { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 });
    throw error;
  }

  let invoice;
  try {
    // Lazy get-or-create: the first request for this order's invoice — from
    // any of View/Download/Print/Share — assigns its number; every later
    // request for the same order returns that same number.
    invoice = await getOrCreateOrderInvoice(storeId, orderCode);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  return invoicePdfResponse(<OrderInvoicePdf invoice={invoice} />, invoice.invoiceSeq, request.nextUrl.searchParams.get('download') === '1');
}
