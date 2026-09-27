import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const [product, order] = await Promise.all([
      prisma.product.findFirst({ where: { storeId: session.storeId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.order.findFirst({ where: { storeId: session.storeId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    return jsonResponse({ productsUpdatedAt: product?.updatedAt.toISOString() ?? null, ordersUpdatedAt: order?.updatedAt.toISOString() ?? null });
  });
}
