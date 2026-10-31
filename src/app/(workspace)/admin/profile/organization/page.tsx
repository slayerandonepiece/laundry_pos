import { redirect } from 'next/navigation';
import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { getStoreProfile } from '@/server/services/profile';
import { listOutletsForStoreAdmin } from '@/server/services/outlets';

export default async function Page() {
  let serverProfile: Awaited<ReturnType<typeof getStoreProfile>> | undefined;
  let serverOutlets: Awaited<ReturnType<typeof listOutletsForStoreAdmin>> = [];
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, undefined, undefined, { allowLockedReadOnly: true });
    if (session.storeRole !== 'OWNER') redirect('/admin/profile');
    [serverProfile, serverOutlets] = await Promise.all([getStoreProfile(session.storeId, session.name), listOutletsForStoreAdmin(session.storeId)]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="profile" profileSection="organization" serverProfile={serverProfile} serverOutlets={serverOutlets} />;
}
