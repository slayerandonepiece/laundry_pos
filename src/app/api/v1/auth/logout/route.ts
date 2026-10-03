import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      await prisma.session.deleteMany({ where: { token } });
    } else {
      const session = await requireApiAuth(req, { allowMustChangePassword: true });
      await prisma.session.deleteMany({ where: { userId: session.id } });
    }
    return jsonResponse({ ok: true });
  });
}
