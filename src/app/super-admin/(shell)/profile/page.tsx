import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getSuperAdminProfile } from '@/server/services/super-admin-profile';
import PageHeading from '@/features/super-admin/components/PageHeading';
import MyProfile from '@/features/super-admin/components/MyProfile';

export default async function Page() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }
  const profile = await getSuperAdminProfile(session.id);
  return <>
    <PageHeading icon="users" title="Profile" subtitle="Your personal account and security." />
    <MyProfile profile={profile} />
  </>;
}
