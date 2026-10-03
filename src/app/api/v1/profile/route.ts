import { NextRequest } from 'next/server';
import { getStoreProfile, saveStoreProfile } from '@/server/services/profile';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const profile = await getStoreProfile(session.storeId, session.name);
    return jsonResponse(profile);
  });
}

export async function PUT(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const body = await req.json();
    const updated = await saveStoreProfile(session.storeId, body, session.id);
    return jsonResponse(updated);
  });
}
