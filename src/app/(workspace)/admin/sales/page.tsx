import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listProducts } from '@/server/services/products';
import { listStorePaymentMethods } from '@/server/services/payment-methods';
import { listOutletsForStoreAdmin } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  let serverPaymentMethods: Awaited<ReturnType<typeof listStorePaymentMethods>> = [];
  let serverOutlets: Awaited<ReturnType<typeof listOutletsForStoreAdmin>> = [];
  try {
    // Sales always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2). Employees always have exactly one active
    // membership (Item 1), so resolveStoreSelection is a no-op for them —
    // this selector only ever surfaces for multi-store owners. The chrome's
    // own store-switcher display is resolved independently in
    // src/app/(workspace)/layout.tsx.
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
    [serverOrders, serverProducts, serverPaymentMethods] = await Promise.all([listOrders(session.storeId), listProducts(session.storeId), listStorePaymentMethods(session.storeId)]);
    // Owners pick the outlet on New sale when the store has more than one active outlet.
    if (session.storeRole === 'OWNER') serverOutlets = (await listOutletsForStoreAdmin(session.storeId)).filter(outlet => outlet.status === 'ACTIVE');
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="sales" serverOrders={serverOrders} serverProducts={serverProducts} serverPaymentMethods={serverPaymentMethods} serverOutlets={serverOutlets} />;
}
