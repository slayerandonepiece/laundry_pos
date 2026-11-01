import { prisma } from '@/server/db';
import { jsonResponse } from '@/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Unauthenticated warm-up: one trivial query wakes an idle Neon database.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ ok: false }, 503);
  }
}
