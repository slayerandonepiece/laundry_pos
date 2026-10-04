import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';
import { requestAccountDeletion } from '@/server/services/account-deletion';

export const runtime = 'nodejs';

const bodySchema = z.object({ storeId: z.string().trim().min(1, 'storeId is required').max(64) });

// Owner of storeId -> whole organization; anyone else -> their own login only.
export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req, { allowMustChangePassword: true, allowDeletionPending: true });
    const { storeId } = bodySchema.parse(await req.json());
    const request = await requestAccountDeletion({ userId: session.id, storeId, via: 'MOBILE' });
    return jsonResponse(request);
  });
}
