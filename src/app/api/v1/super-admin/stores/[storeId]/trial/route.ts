import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setStoreTrial } from '@/server/services/stores';
import {
  handleApiRoute,
  jsonResponse,
  requireApiSuperAdmin,
} from '@/server/api/handler';

export const runtime = 'nodejs';

const trialSchema = z.object({
  trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date format YYYY-MM-DD.'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> },
) {
  return handleApiRoute(async () => {
    await requireApiSuperAdmin(req);
    const { storeId } = await params;
    const body = await req.json();
    const { trialEndsAt } = trialSchema.parse(body);

    const result = await setStoreTrial(storeId, trialEndsAt);
    return jsonResponse(result, 200);
  });
}
