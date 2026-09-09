import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listEmployees } from '@/server/services/employees';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverEmployees: Awaited<ReturnType<typeof listEmployees>> = [];
  try {
    // Employees always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    serverEmployees = await listEmployees(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="employees" serverEmployees={serverEmployees} />;
}
