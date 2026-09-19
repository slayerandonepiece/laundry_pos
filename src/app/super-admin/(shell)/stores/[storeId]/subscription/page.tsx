import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore, listStoreInvoices } from '@/server/services/stores';
import { listPlans } from '@/server/services/subscription-plans';
import { listStoreMembers } from '@/server/services/platform-users';
import { prisma } from '@/server/db';
import { formatCalendarDate } from '@/server/dates';
import { describeLifecycleState, getOrgLifecycleFacts } from '@/server/services/store-lifecycle';
import StoreDetailHub from '@/features/super-admin/components/StoreDetailHub';
import type { SubscriptionPlanListItem } from '@/features/super-admin/types';

export default async function Page({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const store = await getStore(storeId);
  if (!store) notFound();
  const [invoices, plans, members, subscriptionRow, lifecycle] = await Promise.all([
    listStoreInvoices(storeId),
    listPlans(),
    listStoreMembers(storeId),
    prisma.subscription.findUnique({ where: { storeId }, select: { trialEndsAt: true } }),
    getOrgLifecycleFacts(storeId),
  ]);
  if (!lifecycle) notFound();
  return (
    <StoreDetailHub
      store={store}
      lifecycleBadge={describeLifecycleState(lifecycle.state)}
      memberCount={members.length}
      initialTab="subscription"
      initialSubscription={{
        invoices,
        plans: (plans as SubscriptionPlanListItem[]).filter((p) => !p.archivedAt),
        hasSubscription: subscriptionRow !== null,
        trialEndsAt: subscriptionRow?.trialEndsAt ? formatCalendarDate(subscriptionRow.trialEndsAt) : undefined,
      }}
    />
  );
}
