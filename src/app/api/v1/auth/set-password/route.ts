import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { setUserPassword } from '@/server/services/profile';
import { createSessionRow } from '@/server/auth/session';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

const setPasswordSchema = z.object({
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req, { allowMustChangePassword: true, allowDeletionPending: true });
    const body = await req.json();
    const { newPassword } = setPasswordSchema.parse(body);

    await setUserPassword(session.id, newPassword);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    const newSession = await createSessionRow(user.id, user.credentialVersion);

    return jsonResponse({ ok: true, token: newSession.token });
  });
}
