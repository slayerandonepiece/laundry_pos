import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { changeUserPassword, IncorrectPasswordError } from '@/server/services/profile';
import {
  checkPasswordChangeThrottle,
  recordFailedPasswordChange,
  clearPasswordChangeThrottle,
} from '@/server/auth/throttle';
import { createSessionRow } from '@/server/auth/session';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req, { allowMustChangePassword: true });
    const body = await req.json();
    const { oldPassword, newPassword } = changePasswordSchema.parse(body);

    const throttle = await checkPasswordChangeThrottle(session.id);
    if (!throttle.allowed) {
      return new Response(
        JSON.stringify({ error: `Too many failed attempts. Try again in ${throttle.retryAfterSeconds} seconds.` }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
            'Retry-After': String(throttle.retryAfterSeconds),
          },
        },
      );
    }

    try {
      await changeUserPassword(session.id, oldPassword, newPassword);
    } catch (err) {
      if (err instanceof IncorrectPasswordError) await recordFailedPasswordChange(session.id);
      throw err;
    }
    await clearPasswordChangeThrottle(session.id);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    const newSession = await createSessionRow(user.id, user.credentialVersion);

    return jsonResponse({ ok: true, token: newSession.token });
  });
}
