import { NextRequest } from 'next/server';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { decryptSubscriptionInvoiceRef } from '@/server/auth/token';
import { getInvoice, getStore } from '@/server/services/stores';
import { InvoicePdf } from '@/features/super-admin/pdf/InvoicePdf';

// @react-pdf/renderer needs a real Node runtime, not the edge runtime.
export const runtime = 'nodejs';

// The only public door to an owner's subscription invoice. The token is the
// encrypted invoice number; anything that does not decrypt is a plain 404.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const seq = decryptSubscriptionInvoiceRef(token);
  if (!seq) return new Response('Not found', { status: 404 });
  const invoice = await getInvoice(seq);
  const store = invoice ? await getStore(invoice.storeId) : null;
  if (!invoice || !store) return new Response('Not found', { status: 404 });
  return invoicePdfResponse(<InvoicePdf invoice={invoice} store={store} />, formatInvoiceNumber(invoice.invoiceSeq), request.nextUrl.searchParams.get('download') === '1');
}
