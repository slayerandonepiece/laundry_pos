import { NextRequest } from 'next/server';
import { listExpenses, createExpense } from '@/server/services/expenses';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const expenses = await listExpenses(session.storeId);
    return jsonResponse(expenses);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const body = await req.json();
    const expense = await createExpense(session.storeId, body);
    return jsonResponse(expense, 201);
  });
}
