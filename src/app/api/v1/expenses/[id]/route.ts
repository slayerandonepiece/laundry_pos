import { NextRequest } from 'next/server';
import { deleteExpense, updateExpense } from '@/server/services/expenses';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    const body = await req.json();
    // Only body.outletId applies; omitting it makes the expense organization-wide.
    const expense = await updateExpense(session.storeId, id, body);
    return jsonResponse(expense);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const { id } = await params;
    await deleteExpense(session.storeId, id);
    return new Response(null, { status: 204 });
  });
}
