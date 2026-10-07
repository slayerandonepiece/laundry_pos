import { redirect } from 'next/navigation';
import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';

export default async function Page() {
  let methods: Awaited<ReturnType<typeof listOrganizationPaymentMethods>> = [];
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, undefined, undefined, { allowLockedReadOnly: true });
    if (session.storeRole !== 'OWNER') redirect('/admin/profile');
    methods = await listOrganizationPaymentMethods(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="profile" profileSection="payments" serverOrgPaymentMethods={methods} />;
}
