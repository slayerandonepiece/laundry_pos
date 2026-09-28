import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { resolveLoginDestination } from '@/server/auth/actions';

export default async function Page() {
  const session = await getSession();
  if (session) {
    const destination = await resolveLoginDestination(session.id, session.isSuperAdmin);
    if (destination) redirect(destination);
  }
  return <AdminScreenContainer screen="login"/>;
}
