import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listEmployees } from '@/server/services/employees';
import { requireStoreSession, resolveStoreSelection, AuthError, type StoreOption } from '@/server/auth/session';

export default async function Page() {
  let serverEmployees: Awaited<ReturnType<typeof listEmployees>> = [];
  let storeName: string | undefined;
  let storeOptions: StoreOption[] | undefined;
  let selectedStoreId: string | undefined;
  try {
    // Employees always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    storeName = session.storeName;
    if (selection?.multiStore) { storeOptions = selection.options; selectedStoreId = selection.storeId; }
    serverEmployees = await listEmployees(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="employees" serverEmployees={serverEmployees} storeName={storeName} storeOptions={storeOptions} selectedStoreId={selectedStoreId} />;
}
