import { NextRequest } from 'next/server';
import { z } from 'zod';
import { markExpensePaid } from '@/server/services/expenses';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const body = z.object({ paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(await req.json().catch(() => ({})));
    const expense = await markExpensePaid(session.storeId, id, body.paidDate);
    return jsonResponse(expense);
  });
}
