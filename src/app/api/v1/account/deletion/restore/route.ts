import { NextRequest } from 'next/server';
import { handleApiRoute, jsonResponse, requireApiAuth } from '@/server/api/handler';
import { restoreAccountDeletion } from '@/server/services/account-deletion';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiAuth(req, { allowMustChangePassword: true, allowDeletionPending: true });
    await restoreAccountDeletion(session.id);
    return jsonResponse({ status: 'RESTORED' });
  });
}
