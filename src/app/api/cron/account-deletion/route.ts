import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { runDueDeletions } from '@/server/services/account-deletion';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a configured
// secret the route refuses everything.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const summary = await runDueDeletions();
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
