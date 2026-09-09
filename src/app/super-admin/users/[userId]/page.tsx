import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getUser } from '@/server/services/platform-users';
import { listStores } from '@/server/services/stores';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import UserDetail from '@/features/super-admin/components/UserDetail';

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [user, stores] = await Promise.all([getUser(userId), listStores()]);
  if (!user) notFound();
  return (
    <SuperAdminPageShell title={user.name} subtitle="User detail" name={session.name}>
      <UserDetail user={user} stores={stores.map(s => ({ id: s.id, name: s.name }))} />
    </SuperAdminPageShell>
  );
}
