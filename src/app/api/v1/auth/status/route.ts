import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { buildMembershipContext } from '@/server/api/membership-context';
import { getPendingDeletion } from '@/server/services/account-deletion';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req, { allowMustChangePassword: true, allowDeletionPending: true });
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, name: true, phone: true, isSuperAdmin: true, mustChangePassword: true, active: true },
    });

    if (!user || !user.active) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { stores, organizations } = await buildMembershipContext(user.id);
    const pending = await getPendingDeletion(user.id);

    return jsonResponse({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
        ...(pending ? { deletionScheduledFor: pending.scheduledFor } : {}),
      },
      stores,
      organizations,
    });
  });
}
