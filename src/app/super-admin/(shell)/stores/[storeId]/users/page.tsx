import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { listStoreMembers } from '@/server/services/platform-users';
import StoreDetailShell from '@/features/super-admin/components/StoreDetailShell';
import StoreUsersTab from '@/features/super-admin/components/StoreUsersTab';

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
      <StoreUsersTab members={members} />
    </StoreDetailShell>
  );
}
