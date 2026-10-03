import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { getOrderInvoiceByToken } from '@/server/services/order-invoices';
import { OrderInvoicePdf } from '@/features/admin/pdf/OrderInvoicePdf';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getOrderInvoiceByToken(token);
  if (!invoice) return new Response('Not found', { status: 404 });

  return invoicePdfResponse(<OrderInvoicePdf invoice={invoice} />, invoice.invoiceSeq, request.nextUrl.searchParams.get('download') === '1');
}
