import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listExpenses } from '@/server/services/expenses';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  try {
    // Expenses always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    serverExpenses = await listExpenses(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="expenses" serverExpenses={serverExpenses} />;
}
