import { NextRequest } from 'next/server';
import { prisma } from '@/server/db';
import { handleApiRoute, jsonResponse, requireApiStoreSession } from '@/server/api/handler';

export const runtime = 'nodejs';

type Stamp = { updatedAt: Date } | null;
const latest = (...rows: Stamp[]) => {
  const times = rows.flatMap(row => (row ? [row.updatedAt.getTime()] : []));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
};
const newest = { updatedAt: 'desc' } as const;
const pick = { updatedAt: true } as const;

// One lightweight "latest updatedAt" lookup per dataset, all in parallel. The phone compares
// each value with what it last synced (inequality, not ordering: a deleted row can move a value
// backwards). Owner-only datasets are null for employees.
export async function GET(req: NextRequest) {
  return handleApiRoute(async () => {
    const session = await requireApiStoreSession(req, undefined, { allowRestricted: true });
    const storeId = session.storeId;
    const owner = session.storeRole === 'OWNER';
    const none = Promise.resolve(null);
    const [product, order, platformMethod, orgMethod, platformTemplate, orgTemplate, store, expense, employee, invoice, subscription] = await Promise.all([
      prisma.product.findFirst({ where: { storeId }, orderBy: newest, select: pick }),
      prisma.order.findFirst({ where: { storeId }, orderBy: newest, select: pick }),
      // Not filtered to active: deactivating a method must move the value.
      prisma.platformPaymentMethod.findFirst({ orderBy: newest, select: pick }),
      prisma.organizationPaymentMethod.findFirst({ where: { storeId }, orderBy: newest, select: pick }),
      prisma.platformMessageTemplate.findFirst({ orderBy: newest, select: pick }),
      prisma.organizationMessageTemplate.findFirst({ where: { storeId }, orderBy: newest, select: pick }),
      prisma.store.findUnique({ where: { id: storeId }, select: pick }),
      owner ? prisma.expense.findFirst({ where: { storeId }, orderBy: newest, select: pick }) : none,
      owner ? prisma.user.findFirst({ where: { memberships: { some: { storeId, role: 'EMPLOYEE' } } }, orderBy: newest, select: pick }) : none,
      // SubscriptionPayment has no updatedAt; rows are never edited, so createdAt is the change time.
      owner ? prisma.subscriptionPayment.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }) : none,
      // The terms an owner sees come from the plan row unless the subscription overrides them, so
      // an edit to either one moves this.
      owner ? prisma.subscription.findUnique({ where: { storeId }, select: { updatedAt: true, plan: { select: { updatedAt: true } } } }) : none,
    ]);
    return jsonResponse({
      productsUpdatedAt: product?.updatedAt.toISOString() ?? null,
      ordersUpdatedAt: order?.updatedAt.toISOString() ?? null,
      paymentMethodsUpdatedAt: latest(platformMethod, orgMethod),
      messageTemplatesUpdatedAt: latest(platformTemplate, orgTemplate),
      profileUpdatedAt: store?.updatedAt.toISOString() ?? null,
      expensesUpdatedAt: expense?.updatedAt.toISOString() ?? null,
      employeesUpdatedAt: employee?.updatedAt.toISOString() ?? null,
      invoicesUpdatedAt: invoice?.createdAt.toISOString() ?? null,
      planUpdatedAt: subscription ? latest(subscription, subscription.plan) : null,
    });
  });
}
