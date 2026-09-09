import { NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getInvoice, getStore } from '@/server/services/stores';
import { InvoicePdf } from '@/features/super-admin/pdf/InvoicePdf';

// @react-pdf/renderer needs a real Node runtime, not the edge runtime.
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ invoiceSeq: string }> }) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) return new Response('Unauthorized', { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 });
    throw error;
  }

  const { invoiceSeq } = await params;
  const seq = Number(invoiceSeq);
  const invoice = Number.isFinite(seq) ? await getInvoice(seq) : null;
  if (!invoice) return new Response('Not found', { status: 404 });
  const store = await getStore(invoice.storeId);
  if (!store) return new Response('Not found', { status: 404 });

  const buffer = await renderToBuffer(<InvoicePdf invoice={invoice} store={store} />);
  const download = request.nextUrl.searchParams.get('download') === '1';

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="invoice-${invoice.invoiceSeq}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
