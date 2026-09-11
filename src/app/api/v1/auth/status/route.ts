import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { getStoreAccessStatus } from '@/server/auth/session';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req);
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, name: true, username: true, isSuperAdmin: true, mustChangePassword: true, active: true },
    });

    if (!user || !user.active) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const memberships = await prisma.storeMembership.findMany({
      where: { userId: user.id, active: true },
      include: { store: { select: { id: true, name: true, status: true, deletedAt: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const stores = await Promise.all(
      memberships.map(async m => {
        const access = await getStoreAccessStatus(user.id, m.storeId);
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

    return jsonResponse({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
      },
      stores,
    });
  });
}
