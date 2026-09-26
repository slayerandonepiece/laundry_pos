import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getCollectedThisYearStats, listStores } from '@/server/services/stores';
import PageHeading from '@/features/super-admin/components/PageHeading';
import BillingScreenContainer from '@/features/super-admin/containers/BillingScreenContainer';

export default async function BillingPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [stores, collectedThisYear] = await Promise.all([listStores(), getCollectedThisYearStats()]);
  return (
    <>
      <PageHeading
        icon="card"
        title="Billing"
        subtitle="Deposits, annual fees and renewal standing for every organization."
      />
      <BillingScreenContainer stores={stores} collectedThisYear={collectedThisYear} />
    </>
  );
}
