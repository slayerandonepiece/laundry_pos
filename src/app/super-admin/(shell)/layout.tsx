import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import SuperAdminChrome from '@/features/super-admin/components/SuperAdminChrome';

export default async function Layout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  return <SuperAdminChrome name={session.name}>{children}</SuperAdminChrome>;
}
