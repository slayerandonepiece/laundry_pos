import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { getStoreProfile } from '@/server/services/profile';
import { prisma } from '@/server/db';

export default async function Page() {
  let serverProfile: Awaited<ReturnType<typeof getStoreProfile>> | undefined;
  let ownerLoginPhone: string | undefined;
  let passwordUpdatedAt: string | undefined;

  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, undefined, undefined, { allowLockedReadOnly: true });
    ownerLoginPhone = session.phone;

    const [profileData, user] = await Promise.all([
      getStoreProfile(session.storeId, session.name),
      prisma.user.findUnique({ where: { id: session.id }, select: { updatedAt: true } }),
    ]);
    serverProfile = profileData;
    if (user?.updatedAt) passwordUpdatedAt = user.updatedAt.toISOString();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }

  return <AdminScreenContainer screen="profile" profileSection="account" serverProfile={serverProfile} ownerLoginPhone={ownerLoginPhone} passwordUpdatedAt={passwordUpdatedAt} />;
}
