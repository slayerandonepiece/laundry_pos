import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listStores } from '@/server/services/stores';
import { listPlans } from '@/server/services/subscription-plans';
import PageHeading from '@/features/super-admin/components/PageHeading';
import StoresScreenContainer from '@/features/super-admin/containers/StoresScreenContainer';
import OnboardStoreAction from '@/features/super-admin/components/OnboardStoreAction';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [stores, plans] = await Promise.all([listStores(), listPlans()]);
  return (
    <>
      <PageHeading icon="store" title="Organizations" subtitle="Every tenant on the platform, its outlets and its billing standing." action={<OnboardStoreAction plans={plans} />} />
      <StoresScreenContainer stores={stores} />
    </>
  );
}
