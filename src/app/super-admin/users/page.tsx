import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listUsers } from '@/server/services/platform-users';
import { listStores } from '@/server/services/stores';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import UsersScreenContainer from '@/features/super-admin/containers/UsersScreenContainer';
import UserAddAction from '@/features/super-admin/components/UserAddAction';

export default async function Page() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [users, stores] = await Promise.all([listUsers(), listStores()]);
  return (
    <SuperAdminPageShell title="Users" subtitle="Every account on the platform, independent of store onboarding." name={session.name} action={<UserAddAction stores={stores.map(s => ({ id: s.id, name: s.name }))} />}>
      <UsersScreenContainer users={users} />
    </SuperAdminPageShell>
  );
}
