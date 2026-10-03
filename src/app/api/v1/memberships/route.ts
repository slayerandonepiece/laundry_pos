import { NextRequest } from 'next/server';
import { buildMembershipContext } from '@/server/api/membership-context';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req);

    const { stores } = await buildMembershipContext(session.id);

    return jsonResponse(stores);
  });
}
