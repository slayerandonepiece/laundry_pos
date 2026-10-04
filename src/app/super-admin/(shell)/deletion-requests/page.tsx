import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listDeletionRequests } from '@/server/services/account-deletion';
import DeletionRequestsScreenContainer from '@/features/super-admin/containers/DeletionRequestsScreenContainer';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const requests = await listDeletionRequests();
  return <DeletionRequestsScreenContainer requests={requests} />;
}
