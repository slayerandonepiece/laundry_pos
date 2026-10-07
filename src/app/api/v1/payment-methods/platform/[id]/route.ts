import { NextRequest } from 'next/server';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

// Payment methods and where each appears are configured by the platform
// administrator for each organization. Signed-in members can read them
// (GET /api/v1/payment-methods) but nobody can change them from the app.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    await requireApiStoreSession(req);
    await context.params;
    return jsonResponse({ error: 'Payment methods are managed by your platform administrator. Contact support to change them.', code: 'payment_methods_managed_by_platform' }, 403);
  });
}
