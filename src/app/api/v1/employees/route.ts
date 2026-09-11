import { NextRequest } from 'next/server';
import { listEmployees, createEmployee } from '@/server/services/employees';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const employees = await listEmployees(session.storeId);
    return jsonResponse(employees);
  });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const body = await req.json();
    const employee = await createEmployee(session.storeId, body);
    return jsonResponse(employee, 201);
  });
}
