import { NextRequest } from 'next/server';
import { z } from 'zod';
import { listStorePaymentMethods, createStorePaymentMethod } from '@/server/services/payment-methods';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
});

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const includeInactive = req.nextUrl.searchParams.get('all') === 'true';
    const methods = await listStorePaymentMethods(session.storeId, includeInactive);
    return jsonResponse(methods);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const body = await req.json();
    const { name } = createSchema.parse(body);
    const method = await createStorePaymentMethod(session.storeId, name);
    return jsonResponse(method, 201);
  });
}
