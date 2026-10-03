import { NextRequest } from 'next/server';
import { listExpiringSubscriptions } from '@/server/services/stores';
import {
  handleApiRoute,
  jsonResponse,
  requireApiSuperAdmin,
} from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    await requireApiSuperAdmin(req);
    const withinDaysParam = req.nextUrl.searchParams.get('days');
    const withinDays = withinDaysParam ? parseInt(withinDaysParam, 10) : 30;
    const items = await listExpiringSubscriptions(Number.isNaN(withinDays) ? 30 : withinDays);
    return jsonResponse(items);
  });
}
