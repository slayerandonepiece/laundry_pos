import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordPayment } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

const paymentSchema = z.object({
  amount: z.number().int().positive('Payment must be a positive amount'),
  method: z.string().trim().min(1, 'Payment method is required'),
  clientActionId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    const body = await req.json();
    const { amount, method, clientActionId } = paymentSchema.parse(body);

    const updated = await recordPayment(session.storeId, orderCode, amount, method, clientActionId);
    return jsonResponse(updated, 201);
  });
}
