import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listPlans } from '@/server/services/subscription-plans';
import { listStores } from '@/server/services/stores';
import PageHeading from '@/features/super-admin/components/PageHeading';
import PlansScreenContainer from '@/features/super-admin/containers/PlansScreenContainer';
import SubscriptionsShell from '@/features/super-admin/components/SubscriptionsShell';
import PlanNewAction from '@/features/super-admin/components/PlanNewAction';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [plans, stores] = await Promise.all([listPlans(), listStores()]);
  return (
    <>
      <PageHeading icon="subscriptions" title="Subscription plans" subtitle="Reusable pricing templates — attach one when onboarding a store." action={<PlanNewAction />} />
      <SubscriptionsShell planCount={plans.length} storeCount={stores.length}>
        <PlansScreenContainer plans={plans} />
      </SubscriptionsShell>
    </>
  );
}
