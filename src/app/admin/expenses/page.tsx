import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listExpenses } from '@/server/services/expenses';
import { requireSession, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  try {
    await requireSession('OWNER');
    serverExpenses = await listExpenses();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="expenses" serverExpenses={serverExpenses} />;
}
