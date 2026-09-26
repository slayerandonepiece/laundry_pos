import { NextRequest } from 'next/server';
import { z } from 'zod';
import { updatePlatformPaymentMethod } from '@/server/services/platform-payment-methods';
import {
  handleApiRoute,
  jsonResponse,
  requireApiSuperAdmin,
} from '@/server/api/handler';

export const runtime = 'nodejs';

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(async () => {
    await requireApiSuperAdmin(req);
    const { id } = await params;
    const body = await req.json();
    const data = patchSchema.parse(body);

    const updated = await updatePlatformPaymentMethod(id, data);
    return jsonResponse(updated);
  });
}
