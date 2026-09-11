import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { verifyPassword } from '@/server/auth/password';
import { createSessionRow, getStoreAccessStatus } from '@/server/auth/session';
import { checkLoginThrottle, recordFailedLoginAttempt, clearLoginThrottle } from '@/server/auth/throttle';
import { handleApiRoute, jsonResponse } from '@/server/api/handler';

export const runtime = 'nodejs';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const body = await req.json();
    const { username, password } = loginSchema.parse(body);

    const throttle = checkLoginThrottle(username, ip);
    if (!throttle.allowed) {
      return jsonResponse(
        { error: `Too many failed attempts. Try again in ${throttle.retryAfterSeconds} seconds.` },
        429,
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user || !user.active) {
      recordFailedLoginAttempt(username, ip);
      return jsonResponse({ error: 'Invalid username or password' }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordFailedLoginAttempt(username, ip);
      return jsonResponse({ error: 'Invalid username or password' }, 401);
    }

    clearLoginThrottle(username, ip);

    const session = await createSessionRow(user.id, user.credentialVersion);

    const memberships = await prisma.storeMembership.findMany({
      where: { userId: user.id, active: true },
      include: { store: { select: { id: true, name: true, status: true, deletedAt: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const stores = await Promise.all(
      memberships.map(async m => {
        const access = await getStoreAccessStatus(user.id, m.storeId);
        return {
          storeId: m.storeId,
          storeName: m.store.name,
          role: m.role,
          blockedReason: access?.blockedReason ?? null,
          paidThroughDate: access?.paidThroughDate ?? null,
        };
      }),
    );

    return jsonResponse({
      token: session.token,
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
