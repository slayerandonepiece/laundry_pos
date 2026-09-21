import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { getStoreProfile } from '@/server/services/profile';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';
import { listOutletsForStoreAdmin } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { prisma } from '@/server/db';

export default async function Page() {
  let serverProfile: Awaited<ReturnType<typeof getStoreProfile>> | undefined;
  let serverPaymentMethods: Awaited<ReturnType<typeof listOrganizationPaymentMethods>> = [];
  let serverOutlets: Awaited<ReturnType<typeof listOutletsForStoreAdmin>> = [];
  let storeInfo = null;
  let ownerUsername: string | undefined;
  let passwordUpdatedAt: string | undefined;
  
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    ownerUsername = session.username;
    
    const [profileData, methods, outlets, store, user] = await Promise.all([
      getStoreProfile(session.storeId, session.name),
      listOrganizationPaymentMethods(session.storeId),
      listOutletsForStoreAdmin(session.storeId),
      getStore(session.storeId),
      prisma.user.findUnique({ where: { id: session.id }, select: { updatedAt: true } }),
    ]);
    
    serverProfile = profileData;
    serverPaymentMethods = methods;
    serverOutlets = outlets;
    storeInfo = store;
    if (user?.updatedAt) {
      passwordUpdatedAt = user.updatedAt.toISOString();
    }
    
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  
  return <AdminScreenContainer screen="profile" serverProfile={serverProfile} serverPaymentMethods={serverPaymentMethods} serverOutlets={serverOutlets} storeInfo={storeInfo} ownerUsername={ownerUsername} passwordUpdatedAt={passwordUpdatedAt} />;
}
