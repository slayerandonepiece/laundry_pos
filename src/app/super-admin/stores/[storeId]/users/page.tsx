import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { listStoreMembers } from '@/server/services/platform-users';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import StoreDetailShell from '@/features/super-admin/components/StoreDetailShell';
import StoreUsersTab from '@/features/super-admin/components/StoreUsersTab';
import Icon from '@/features/super-admin/components/Icon';

export default async function Page({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const store = await getStore(storeId);
  if (!store) notFound();
  const members = await listStoreMembers(storeId);
  const breadcrumb = <>Platform <Icon name="chevronRight" /> <Link href="/super-admin/stores">Stores</Link> <Icon name="chevronRight" /> <b>{store.name}</b></>;
  return (
    <SuperAdminPageShell title={store.name} subtitle="Store detail" name={session.name} breadcrumb={breadcrumb} hidePhead>
      <StoreDetailShell store={store} memberCount={members.length}>
        <StoreUsersTab members={members} />
      </StoreDetailShell>
    </SuperAdminPageShell>
  );
}
