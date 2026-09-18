import { NextRequest } from 'next/server';
import {
  getDailyOutletSummaries,
  getDailyOutletServiceSummaries,
} from '@/server/services/dashboard-rollups';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
  resolveOutletIdFromRequest,
} from '@/server/api/handler';
import { resolveAllowedOutlets, AuthError } from '@/server/auth/session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const searchParams = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
    const fromDate = searchParams.get('from') ?? undefined;
    const toDate = searchParams.get('to') ?? undefined;
    const type = searchParams.get('type') ?? 'daily';

    let outletId: string | undefined;
    if (session.storeRole === 'EMPLOYEE') {
      const { allowedOutlets } = await resolveAllowedOutlets(session.id, session.storeId, session.storeRole);
      const requestedOutletId = resolveOutletIdFromRequest(req);
      if (requestedOutletId && !allowedOutlets.some(o => o.id === requestedOutletId)) {
        throw new AuthError('FORBIDDEN');
      }
      outletId = requestedOutletId ?? allowedOutlets[0]?.id;
    } else {
      outletId = resolveOutletIdFromRequest(req) ?? searchParams.get('outletId') ?? undefined;
    }

    if (type === 'services') {
      const serviceSummaries = await getDailyOutletServiceSummaries(session.storeId, {
        outletId,
        fromDate,
        toDate,
      });
      return jsonResponse(serviceSummaries);
    }

    const summaries = await getDailyOutletSummaries(session.storeId, {
      outletId,
      fromDate,
      toDate,
    });
    return jsonResponse(summaries);
  });
}
