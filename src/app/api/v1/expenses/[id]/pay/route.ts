import { NextRequest } from 'next/server';
import { markExpensePaid } from '@/server/services/expenses';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const expense = await markExpensePaid(session.storeId, id);
    return jsonResponse(expense);
  });
}
