import { NextRequest } from 'next/server';
import { updateEmployee } from '@/server/services/employees';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const body = await req.json();
    const updated = await updateEmployee(session.storeId, { ...body, id });
    return jsonResponse(updated);
  });
}
