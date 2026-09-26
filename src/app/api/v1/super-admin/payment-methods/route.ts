import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createPlatformPaymentMethod,
  listPlatformPaymentMethods,
} from '@/server/services/platform-payment-methods';
import {
  handleApiRoute,
  jsonResponse,
  requireApiSuperAdmin,
} from '@/server/api/handler';

export const runtime = 'nodejs';

const createSchema = z.object({
  code: z.string().trim().min(2),
  name: z.string().trim().min(1),
});

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    await requireApiSuperAdmin(req);
    const includeInactive = req.nextUrl.searchParams.get('all') === 'true';
    const methods = await listPlatformPaymentMethods(includeInactive);
    return jsonResponse(methods);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    await requireApiSuperAdmin(req);
    const body = await req.json();
    const { code, name } = createSchema.parse(body);
    const method = await createPlatformPaymentMethod({ code, name });
    return jsonResponse(method, 201);
  });
}
