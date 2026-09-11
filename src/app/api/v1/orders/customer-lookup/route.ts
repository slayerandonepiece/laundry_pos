import { NextRequest } from 'next/server';
import { findCustomerNameByPhone } from '@/server/services/orders';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';
import { ValidationError } from '@/server/errors';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const url = new URL(req.url);
    const phone = url.searchParams.get('phone')?.trim() ?? '';
    if (!phone) throw new ValidationError('Phone number is required.');

    const name = await findCustomerNameByPhone(session.storeId, phone);
    return jsonResponse({ name });
  });
}
