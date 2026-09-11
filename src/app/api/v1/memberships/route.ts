import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { getStoreAccessStatus } from '@/server/auth/session';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req);

    const memberships = await prisma.storeMembership.findMany({
      where: { userId: session.id, active: true },
      include: { store: { select: { id: true, name: true, status: true, deletedAt: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const stores = await Promise.all(
      memberships.map(async m => {
        const access = await getStoreAccessStatus(session.id, m.storeId);
        const isLocked = access?.blockedReason === 'store_locked' || m.store.status === 'LOCKED';
        return {
          storeId: m.storeId,
          storeName: m.store.name,
          role: m.role,
          status: m.store.status,
          isLocked,
          blockedReason: access?.blockedReason ?? null,
          paidThroughDate: access?.paidThroughDate ?? null,
        };
      }),
    );

    return jsonResponse(stores);
  });
}
