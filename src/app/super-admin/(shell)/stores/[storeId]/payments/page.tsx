import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { listStoreMembers } from '@/server/services/platform-users';
import { describeLifecycleState, getOrgLifecycleFacts } from '@/server/services/store-lifecycle';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';
import StoreDetailHub from '@/features/super-admin/components/StoreDetailHub';

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
  const [members, lifecycle, data] = await Promise.all([
    listStoreMembers(storeId),
    getOrgLifecycleFacts(storeId),
    listOrganizationPaymentMethods(storeId),
  ]);
  if (!lifecycle) notFound();
  return (
    <StoreDetailHub
      store={store}
      lifecycleBadge={describeLifecycleState(lifecycle.state)}
      memberCount={members.length}
      initialTab="payments"
      initialPayments={{ methods: data }}
    />
  );
}
