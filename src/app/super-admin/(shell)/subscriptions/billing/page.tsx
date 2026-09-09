import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getCollectedThisYearStats, listStores } from '@/server/services/stores';
import { listPlans } from '@/server/services/subscription-plans';
import PageHeading from '@/features/super-admin/components/PageHeading';
import SubscriptionsShell from '@/features/super-admin/components/SubscriptionsShell';
import BillingScreenContainer from '@/features/super-admin/containers/BillingScreenContainer';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [stores, plans, collectedThisYear] = await Promise.all([listStores(), listPlans(), getCollectedThisYearStats()]);
  return (
    <>
      <PageHeading icon="subscriptions" title="Subscriptions" subtitle="Deposits, annual fees and renewal standing for every store." />
      <SubscriptionsShell planCount={plans.length} storeCount={stores.length}>
        <BillingScreenContainer stores={stores} collectedThisYear={collectedThisYear} />
      </SubscriptionsShell>
    </>
  );
}
