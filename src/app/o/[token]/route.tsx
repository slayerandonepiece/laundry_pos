import { NextRequest } from 'next/server';
import { invoicePdfResponse } from '@/lib/pdf/response';
import { getOrderSlipByToken } from '@/server/services/order-slips';
import { OrderSlipPdf } from '@/features/admin/pdf/OrderSlipPdf';

export const runtime = 'nodejs';

// Public customer link to an order slip. Reachable only with its opaque token.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const slip = await getOrderSlipByToken(token);
  if (!slip) return new Response('Not found', { status: 404 });
  return invoicePdfResponse(<OrderSlipPdf slip={slip} />, `Order ${slip.orderCode}`, request.nextUrl.searchParams.get('download') === '1');
}
