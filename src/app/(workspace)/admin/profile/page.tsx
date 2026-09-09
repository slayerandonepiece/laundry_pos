import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { getStoreProfile } from '@/server/services/profile';
import { listStorePaymentMethods } from '@/server/services/payment-methods';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverProfile: Awaited<ReturnType<typeof getStoreProfile>> | undefined;
  let serverPaymentMethods: Awaited<ReturnType<typeof listStorePaymentMethods>> = [];
  let ownerUsername: string | undefined;
  try {
    // Profile is store-scoped contact info, so it follows the same
    // single-specific-store rule as every other non-Dashboard screen (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    ownerUsername = session.username;
    [serverProfile, serverPaymentMethods] = await Promise.all([
      getStoreProfile(session.storeId, session.name),
      listStorePaymentMethods(session.storeId, true),
    ]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="profile" serverProfile={serverProfile} serverPaymentMethods={serverPaymentMethods} ownerUsername={ownerUsername} />;
}
