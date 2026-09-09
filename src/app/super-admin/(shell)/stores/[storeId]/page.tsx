import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { listStoreMembers } from '@/server/services/platform-users';
import StoreDetailShell from '@/features/super-admin/components/StoreDetailShell';
import StoreOverviewTab from '@/features/super-admin/components/StoreOverviewTab';

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
  const members = await listStoreMembers(storeId);
  return (
    <StoreDetailShell store={store} memberCount={members.length}>
      <StoreOverviewTab store={store} members={members} />
    </StoreDetailShell>
  );
}
