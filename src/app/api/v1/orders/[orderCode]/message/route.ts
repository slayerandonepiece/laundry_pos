import { NextRequest } from 'next/server';
import { buildOrderMessage } from '@/server/services/order-messages';
import { assertCanReadOrderInvoice } from '@/server/services/order-invoices';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

// The customer message for the order's current status, filled from the
// organization's template. `text` still contains {link}: replace it with the
// absolute URL (origin + linkPath). `pdfPath` is the public PDF to attach.
export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    await assertCanReadOrderInvoice(session, orderCode);
    return jsonResponse(await buildOrderMessage(session.storeId, orderCode));
  });
}
