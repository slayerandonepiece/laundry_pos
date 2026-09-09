import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getOrderInvoiceByToken } from '@/server/services/order-invoices';
import { OrderInvoicePdf } from '@/features/admin/pdf/OrderInvoicePdf';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getOrderInvoiceByToken(token);
  if (!invoice) return new Response('Not found', { status: 404 });

  const buffer = await renderToBuffer(<OrderInvoicePdf invoice={invoice} />);
  const download = request.nextUrl.searchParams.get('download') === '1';

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${formatInvoiceNumber(invoice.invoiceSeq)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
