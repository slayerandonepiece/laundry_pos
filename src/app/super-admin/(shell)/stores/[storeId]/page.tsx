import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { describeLifecycleState, getOrgLifecycleFacts } from '@/server/services/store-lifecycle';
import { listStoreMembers } from '@/server/services/platform-users';
import { listStoreActivity } from '@/server/services/activity';
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
  const [members, lifecycle, activity] = await Promise.all([
    listStoreMembers(storeId),
    getOrgLifecycleFacts(storeId),
    listStoreActivity(storeId, 3),
  ]);
  if (!lifecycle) notFound();
  return (
    <StoreDetailHub
      store={store}
      lifecycleBadge={describeLifecycleState(lifecycle.state)}
      memberCount={members.length}
      initialTab="overview"
      initialOverview={{ members, lifecycle, activity }}
    />
  );
}
