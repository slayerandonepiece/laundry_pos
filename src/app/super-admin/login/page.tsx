import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import SuperAdminLoginForm from '@/features/super-admin/components/SuperAdminLoginForm';

export default async function Page() {
  const session = await getSession();
  if (session?.isSuperAdmin) redirect('/super-admin');
  return <SuperAdminLoginForm />;
}
