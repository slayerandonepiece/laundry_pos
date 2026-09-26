import { NextRequest } from 'next/server';
import { z } from 'zod';
import { reconcileDailyOutletRollups } from '@/server/services/dashboard-rollups';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
  requireApiSuperAdmin,
} from '@/server/api/handler';

export const runtime = 'nodejs';

const reconcileSchema = z.object({
  outletId: z.string().trim().min(1),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  storeId: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const rawBody = await req.json();
    const data = reconcileSchema.parse(rawBody);

    let storeId: string;
    let actorId: string;

    if (data.storeId) {
      // If storeId is explicitly passed, requires super-admin
      const superAdminUser = await requireApiSuperAdmin(req);
      storeId = data.storeId;
      actorId = superAdminUser.id;
    } else {
      // Standard store owner flow
      const storeSession = await requireApiStoreSession(req, 'OWNER');
      storeId = storeSession.storeId;
      actorId = storeSession.id;
    }

    const result = await reconcileDailyOutletRollups(
      storeId,
      data.outletId,
      data.fromDate,
      data.toDate,
      actorId,
    );

    return jsonResponse({
      success: true,
      outletId: data.outletId,
      fromDate: data.fromDate,
      toDate: data.toDate,
      daysReconciled: result.daysReconciled,
    });
  });
}
