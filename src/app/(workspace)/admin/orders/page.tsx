import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listProducts } from '@/server/services/products';
import { listStorePaymentMethods } from '@/server/services/payment-methods';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  let serverPaymentMethods: Awaited<ReturnType<typeof listStorePaymentMethods>> = [];
  try {
    // Orders always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2).
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
    [serverOrders, serverProducts, serverPaymentMethods] = await Promise.all([listOrders(session.storeId), listProducts(session.storeId), listStorePaymentMethods(session.storeId)]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="orders" serverOrders={serverOrders} serverProducts={serverProducts} serverPaymentMethods={serverPaymentMethods} />;
}
