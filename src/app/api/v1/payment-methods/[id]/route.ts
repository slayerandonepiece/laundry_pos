import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setOrganizationPaymentMethodEnabled } from '@/server/services/platform-payment-methods';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

// `active` is accepted as an alias for `enabled` so clients written against the
// legacy per-store shape keep working without a coordinated release.
const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    active: z.boolean().optional(),
    name: z.string().optional(),
  })
  .refine(body => body.enabled !== undefined || body.active !== undefined, {
    message: 'Provide enabled (or active) as a boolean.',
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const body = await req.json();
    const data = patchSchema.parse(body);

    // The display name belongs to the platform catalogue and is shared by every
    // organization using the method, so an owner cannot change it from here.
    if (data.name !== undefined) {
      return jsonResponse(
        { error: 'Payment method names are managed in the platform catalogue and cannot be renamed here.' },
        400,
      );
    }

    const enabled = data.enabled ?? data.active!;
    const method = await setOrganizationPaymentMethodEnabled(session.storeId, id, enabled);
    return jsonResponse(method);
  });
}
