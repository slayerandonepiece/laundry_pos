import { NextRequest } from 'next/server';
import { listExpenses, createExpense } from '@/server/services/expenses';
import {
  handleApiRoute,
  jsonResponse,
  requireApiStoreSession,
  resolveOutletIdFromRequest,
} from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const outletId = resolveOutletIdFromRequest(req);
    const expenses = await listExpenses(session.storeId, { outletId });
    return jsonResponse(expenses);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const body = await req.json();
    const outletId = resolveOutletIdFromRequest(req);
    const expense = await createExpense(session.storeId, body, outletId);
    return jsonResponse(expense, 201);
  });
}
