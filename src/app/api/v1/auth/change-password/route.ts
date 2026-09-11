import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { changeUserPassword } from '@/server/services/profile';
import { createSessionRow } from '@/server/auth/session';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req);
    const body = await req.json();
    const { oldPassword, newPassword } = changePasswordSchema.parse(body);

    await changeUserPassword(session.id, oldPassword, newPassword);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    const newSession = await createSessionRow(user.id, user.credentialVersion);

    return jsonResponse({ ok: true, token: newSession.token });
  });
}
