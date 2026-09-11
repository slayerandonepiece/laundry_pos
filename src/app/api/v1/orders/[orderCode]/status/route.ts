import { NextRequest } from 'next/server';
import { z } from 'zod';
import { updateOrderStatus } from '@/server/services/orders';
import type { WorkStatus } from '@/features/admin/admin.types';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

const statusSchema = z.object({
  status: z.custom<WorkStatus>(val => typeof val === 'string' && val.trim().length > 0, 'Status is required'),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orderCode: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const { orderCode } = await params;
    const body = await req.json();
    const { status } = statusSchema.parse(body);

    const updated = await updateOrderStatus(session.storeId, orderCode, status, session.id);
    return jsonResponse(updated);
  });
}
