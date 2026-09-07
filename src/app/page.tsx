import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listExpenses } from '@/server/services/expenses';
import { listProducts } from '@/server/services/products';
import { requireSession, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  try {
    await requireSession('OWNER');
    [serverOrders, serverExpenses, serverProducts] = await Promise.all([listOrders(), listExpenses(), listProducts()]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="dashboard" serverOrders={serverOrders} serverExpenses={serverExpenses} serverProducts={serverProducts} />;
}
