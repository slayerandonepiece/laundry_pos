import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { handleApiRoute, requireApiStoreSession } from '@/server/api/handler';
import { getInvoice, getStore } from '@/server/services/stores';
import { InvoicePdf } from '@/features/super-admin/pdf/InvoicePdf';

// @react-pdf/renderer needs a real Node runtime, not the edge runtime.
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceSeq: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER', { allowRestricted: true, allowLockedReadOnly: true });
    const { invoiceSeq } = await params;
    const seq = Number(invoiceSeq);
    if (!Number.isInteger(seq)) return new Response('Not found', { status: 404 });

    const invoice = await getInvoice(seq);
    // Another store's invoice is indistinguishable from a missing one.
    if (!invoice || invoice.storeId !== session.storeId) return new Response('Not found', { status: 404 });
    const store = await getStore(session.storeId);
    if (!store) return new Response('Not found', { status: 404 });

    return invoicePdfResponse(<InvoicePdf invoice={invoice} store={store} />, invoice.invoiceSeq, req.nextUrl.searchParams.get('download') === '1');
  });
}
