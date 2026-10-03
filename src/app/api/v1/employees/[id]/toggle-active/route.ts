import { NextRequest } from 'next/server';
import { toggleEmployeeActive } from '@/server/services/employees';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const updated = await toggleEmployeeActive(session.storeId, id);
    return jsonResponse(updated);
  });
}
