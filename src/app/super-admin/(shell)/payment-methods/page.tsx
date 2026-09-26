import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listPlatformPaymentMethods } from '@/server/services/platform-payment-methods';
import PageHeading from '@/features/super-admin/components/PageHeading';
import PaymentMethodsScreenContainer from '@/features/super-admin/containers/PaymentMethodsScreenContainer';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }

  const methods = await listPlatformPaymentMethods(true);

  return (
    <>
      <PageHeading
        icon="card"
        title="Payment methods"
        subtitle="Global catalog of payment methods available to organizations."
      />
      <PaymentMethodsScreenContainer methods={methods} />
    </>
  );
}
