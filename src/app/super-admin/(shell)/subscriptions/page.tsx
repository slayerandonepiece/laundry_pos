import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listPlans } from '@/server/services/subscription-plans';
import PageHeading from '@/features/super-admin/components/PageHeading';
import PlansScreenContainer from '@/features/super-admin/containers/PlansScreenContainer';
import PlanNewAction from '@/features/super-admin/components/PlanNewAction';

export default async function SubscriptionsPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const plans = await listPlans();
  return (
    <>
      <PageHeading
        icon="subscriptions"
        title="Subscription plans"
        subtitle="Reusable pricing templates — attach one when onboarding an organization."
        action={<PlanNewAction />}
      />
      <PlansScreenContainer plans={plans} />
    </>
  );
}
