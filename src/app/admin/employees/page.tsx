import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listEmployees } from '@/server/services/employees';
import { requireSession, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverEmployees: Awaited<ReturnType<typeof listEmployees>> = [];
  try {
    await requireSession('OWNER');
    serverEmployees = await listEmployees();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="employees" serverEmployees={serverEmployees} />;
}
