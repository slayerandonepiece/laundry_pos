import { NextRequest } from 'next/server';
import { z } from 'zod';
import { renameStorePaymentMethod, setStorePaymentMethodActive } from '@/server/services/payment-methods';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const body = await req.json();
    const data = patchSchema.parse(body);

    let method;
    if (data.name !== undefined) {
      method = await renameStorePaymentMethod(session.storeId, id, data.name);
    }
    if (data.active !== undefined) {
      method = await setStorePaymentMethodActive(session.storeId, id, data.active);
    }

    if (!method) {
      return jsonResponse({ error: 'No update parameters provided' }, 400);
    }

    return jsonResponse(method);
  });
}
