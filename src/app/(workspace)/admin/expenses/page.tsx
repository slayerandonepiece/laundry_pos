import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listExpenses } from '@/server/services/expenses';
import { listOutletsForStoreAdmin } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  let serverOutlets: Awaited<ReturnType<typeof listOutletsForStoreAdmin>> = [];
  try {
    // Expenses always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER', undefined, { allowLockedReadOnly: true });
    serverExpenses = await listExpenses(session.storeId);
    serverOutlets = await listOutletsForStoreAdmin(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="expenses" serverExpenses={serverExpenses} serverOutlets={serverOutlets} />;
}
