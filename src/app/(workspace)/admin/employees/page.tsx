import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listEmployees } from '@/server/services/employees';
import { listOutletsForStoreAdmin } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverEmployees: Awaited<ReturnType<typeof listEmployees>> = [];
  let serverOutlets: Awaited<ReturnType<typeof listOutletsForStoreAdmin>> = [];
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    serverEmployees = await listEmployees(session.storeId);
    serverOutlets = await listOutletsForStoreAdmin(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="employees" serverEmployees={serverEmployees} serverOutlets={serverOutlets} />;
}
