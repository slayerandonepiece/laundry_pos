import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { getStoreProfile } from '@/server/services/profile';
import { requireSession, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverProfile: Awaited<ReturnType<typeof getStoreProfile>> | undefined;
  let ownerUsername: string | undefined;
  try {
    const session = await requireSession('OWNER');
    ownerUsername = session.username;
    serverProfile = await getStoreProfile();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="profile" serverProfile={serverProfile} ownerUsername={ownerUsername} />;
}
