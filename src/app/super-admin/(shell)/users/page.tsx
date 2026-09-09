import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listUsers } from '@/server/services/platform-users';
import { listStores } from '@/server/services/stores';
import PageHeading from '@/features/super-admin/components/PageHeading';
import UsersScreenContainer from '@/features/super-admin/containers/UsersScreenContainer';
import UserAddAction from '@/features/super-admin/components/UserAddAction';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [users, stores] = await Promise.all([listUsers(), listStores()]);
  return (
    <>
      <PageHeading icon="users" title="Users" subtitle="Every account on the platform, independent of store onboarding." action={<UserAddAction stores={stores.map(s => ({ id: s.id, name: s.name }))} />} />
      <UsersScreenContainer users={users} />
    </>
  );
}
