import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listProducts } from '@/server/services/products';
import { requireSession, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  try {
    await requireSession();
    [serverOrders, serverProducts] = await Promise.all([listOrders(), listProducts()]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="sales" serverOrders={serverOrders} serverProducts={serverProducts} />;
}
