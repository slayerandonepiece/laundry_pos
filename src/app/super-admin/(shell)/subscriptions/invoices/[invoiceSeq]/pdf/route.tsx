import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { isValidSubscriptionInvoiceToken } from '@/server/auth/token';
import { getInvoice, getStore } from '@/server/services/stores';
import { InvoicePdf } from '@/features/super-admin/pdf/InvoicePdf';

// @react-pdf/renderer needs a real Node runtime, not the edge runtime.
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ invoiceSeq: string }> }) {
  const { invoiceSeq } = await params;
  const seq = Number(invoiceSeq);
  if (!Number.isFinite(seq)) return new Response('Not found', { status: 404 });

  const token = request.nextUrl.searchParams.get('token');
  const hasValidToken = token ? isValidSubscriptionInvoiceToken(seq, token) : false;

  if (!hasValidToken) {
    try {
      await requireSuperAdmin();
    } catch (error) {
      if (error instanceof AuthError) return new Response('Unauthorized', { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 });
      throw error;
    }
  }

  const invoice = await getInvoice(seq);
  if (!invoice) return new Response('Not found', { status: 404 });
  const store = await getStore(invoice.storeId);
  if (!store) return new Response('Not found', { status: 404 });

  return invoicePdfResponse(<InvoicePdf invoice={invoice} store={store} />, invoice.invoiceSeq, request.nextUrl.searchParams.get('download') === '1');
}
