import { NextRequest } from 'next/server';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
} from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const methods = await listOrganizationPaymentMethods(session.storeId);
    return jsonResponse(methods);
  });
}
