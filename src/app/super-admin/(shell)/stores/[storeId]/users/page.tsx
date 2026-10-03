import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { listStoreMembers } from '@/server/services/platform-users';
import { listOutletsForStore, listOutletMembershipsForStore } from '@/server/services/outlets';
import { describeLifecycleState, getOrgLifecycleFacts } from '@/server/services/store-lifecycle';
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
  const [members, outlets, membershipsByUser, lifecycle] = await Promise.all([
    listStoreMembers(storeId),
    listOutletsForStore(storeId),
    listOutletMembershipsForStore(storeId),
    getOrgLifecycleFacts(storeId),
  ]);
  if (!lifecycle) notFound();
  const membersWithOutlets = members.map((m: { userId: string; name: string; phone: string; active: boolean; role: 'OWNER' | 'EMPLOYEE' }) => ({
    ...m,
    outletsGranted: m.role === 'OWNER' ? 'All outlets' : outlets.length === 0 ? '—' : `${(membershipsByUser[m.userId] ?? []).length} of ${outlets.length}`,
  }));
  return (
    <StoreDetailHub
      store={store}
      lifecycleBadge={describeLifecycleState(lifecycle.state)}
      memberCount={members.length}
      initialTab="users"
      initialPeople={{ members: membersWithOutlets }}
    />
  );
}
