import { NextRequest } from 'next/server';
import { listProducts, saveProduct } from '@/server/services/products';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req);
    const products = await listProducts(session.storeId);
    return jsonResponse(products);
  }, { request: req, cacheTtlSeconds: 30 });
}

export async function POST(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, 'OWNER');
    const body = await req.json();
    const saved = await saveProduct(session.storeId, body);
    return jsonResponse(saved, 201);
  });
}
