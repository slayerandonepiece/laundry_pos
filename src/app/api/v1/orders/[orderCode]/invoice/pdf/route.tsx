import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getOrCreateOrderInvoice } from '@/server/services/order-invoices';
import { OrderInvoicePdf } from '@/features/admin/pdf/OrderInvoicePdf';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { handleApiRoute, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;

    const invoice = await getOrCreateOrderInvoice(session.storeId, orderCode);
    const buffer = await renderToBuffer(<OrderInvoicePdf invoice={invoice} />);
    const download = req.nextUrl.searchParams.get('download') === '1';

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${formatInvoiceNumber(invoice.invoiceSeq)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
