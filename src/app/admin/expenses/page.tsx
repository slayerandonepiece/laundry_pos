import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listExpenses } from '@/server/services/expenses';
import { requireStoreSession, resolveStoreSelection, AuthError, type StoreOption } from '@/server/auth/session';

export default async function Page() {
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  let storeName: string | undefined;
  let storeOptions: StoreOption[] | undefined;
  let selectedStoreId: string | undefined;
  try {
    // Expenses always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    storeName = session.storeName;
    if (selection?.multiStore) { storeOptions = selection.options; selectedStoreId = selection.storeId; }
    serverExpenses = await listExpenses(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="expenses" serverExpenses={serverExpenses} storeName={storeName} storeOptions={storeOptions} selectedStoreId={selectedStoreId} />;
}
