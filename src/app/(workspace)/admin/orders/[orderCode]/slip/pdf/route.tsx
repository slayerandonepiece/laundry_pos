import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { assertCanReadOrderInvoice } from '@/server/services/order-invoices';
import { getOrCreateOrderSlip } from '@/server/services/order-slips';
import { OrderSlipPdf } from '@/features/admin/pdf/OrderSlipPdf';

// @react-pdf/renderer needs a real Node runtime, not the edge runtime.
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode } = await params;
  let storeId: string;
  try {
    // Any signed-in member of the order's store; an employee only for their own outlets.
    const storeSelection = await resolveStoreSelection();
    const session = await requireStoreSession(storeSelection?.multiStore ? storeSelection.storeId : undefined);
    storeId = session.storeId;
    await assertCanReadOrderInvoice(session, orderCode);
  } catch (error) {
    if (error instanceof AuthError) return new Response('Unauthorized', { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 });
    throw error;
  }
  let slip;
  try {
    slip = await getOrCreateOrderSlip(storeId, orderCode);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  return invoicePdfResponse(<OrderSlipPdf slip={slip} />, `Order ${slip.orderCode}`, request.nextUrl.searchParams.get('download') === '1');
}
