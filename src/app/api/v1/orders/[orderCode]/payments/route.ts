import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordPayment } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

const paymentSchema = z.object({
  amount: z.number().int().positive('Payment must be a positive amount'),
  method: z.string().trim().min(1, 'Payment method is required'),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    const body = await req.json();
    const { amount, method } = paymentSchema.parse(body);

    const updated = await recordPayment(session.storeId, orderCode, amount, method);
    return jsonResponse(updated, 201);
  });
}
