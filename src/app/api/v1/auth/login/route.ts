import { normalizePhone } from '@/lib/contactValidation';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { verifyPassword, verifyPasswordAgainstDummy } from '@/server/auth/password';
import { createSessionRow } from '@/server/auth/session';
import { buildMembershipContext } from '@/server/api/membership-context';
import { checkLoginThrottle, recordFailedLoginAttempt, clearLoginThrottle } from '@/server/auth/throttle';
import { handleApiRoute, jsonResponse } from '@/server/api/handler';

export const runtime = 'nodejs';

const loginSchema = z.object({
  phone: z.string().trim().min(8, 'Phone number is required').max(20).transform(normalizePhone).refine(value => /^[0-9]{8,15}$/.test(value), 'Enter a valid phone number (8–15 digits).'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const body = await req.json();
    const { phone, password } = loginSchema.parse(body);

    const throttle = await checkLoginThrottle(phone, ip);
    if (!throttle.allowed) {
      return jsonResponse(
        { error: `Too many failed attempts. Try again in ${throttle.retryAfterSeconds} seconds.` },
        429,
      );
    }

    const user = await prisma.user.findUnique({
      where: { phone: normalizePhone(phone) },
    });

    // Always pay for one bcrypt comparison so a missing/inactive account is
    // indistinguishable from a wrong password by response time.
    const valid = user?.active
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPasswordAgainstDummy(password);
    if (!user || !user.active || !valid) {
      await recordFailedLoginAttempt(phone, ip);
      return jsonResponse({ error: 'Invalid phone number or password' }, 401);
    }

    await clearLoginThrottle(phone, ip);

    const session = await createSessionRow(user.id, user.credentialVersion);

    const { stores, organizations } = await buildMembershipContext(user.id);

    return jsonResponse({
      token: session.token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
      },
      stores,
      organizations,
    });
  });
}
