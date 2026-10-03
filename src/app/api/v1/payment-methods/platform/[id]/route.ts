import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setOrganizationPaymentMethodEnabled } from '@/server/services/platform-payment-methods';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
} from '@/server/api/handler';

export const runtime = 'nodejs';

const patchSchema = z.object({
  enabled: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const body = await req.json();
    const { enabled } = patchSchema.parse(body);

    const updated = await setOrganizationPaymentMethodEnabled(session.storeId, id, enabled);
    return jsonResponse(updated);
  });
}
