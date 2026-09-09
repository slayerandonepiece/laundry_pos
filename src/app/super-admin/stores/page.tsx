import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listStores } from '@/server/services/stores';
import { listPlans } from '@/server/services/subscription-plans';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import StoresScreenContainer from '@/features/super-admin/containers/StoresScreenContainer';
import OnboardStoreAction from '@/features/super-admin/components/OnboardStoreAction';

export default async function Page() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [stores, plans] = await Promise.all([listStores(), listPlans()]);
  return (
    <SuperAdminPageShell title="Stores" subtitle="Every store onboarded onto the platform." name={session.name} action={<OnboardStoreAction plans={plans} />}>
      <StoresScreenContainer stores={stores} />
    </SuperAdminPageShell>
  );
}
