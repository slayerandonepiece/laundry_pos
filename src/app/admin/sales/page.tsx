import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listProducts } from '@/server/services/products';
import { listStorePaymentMethods } from '@/server/services/payment-methods';
import { requireStoreSession, resolveStoreSelection, AuthError, type StoreOption } from '@/server/auth/session';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  let serverPaymentMethods: Awaited<ReturnType<typeof listStorePaymentMethods>> = [];
  let storeName: string | undefined;
  let storeOptions: StoreOption[] | undefined;
  let selectedStoreId: string | undefined;
  try {
    // Sales always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2). Employees always have exactly one active
    // membership (Item 1), so resolveStoreSelection is a no-op for them —
    // this selector only ever surfaces for multi-store owners.
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
    storeName = session.storeName;
    if (selection?.multiStore) { storeOptions = selection.options; selectedStoreId = selection.storeId; }
    [serverOrders, serverProducts, serverPaymentMethods] = await Promise.all([listOrders(session.storeId), listProducts(session.storeId), listStorePaymentMethods(session.storeId)]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="sales" serverOrders={serverOrders} serverProducts={serverProducts} serverPaymentMethods={serverPaymentMethods} storeName={storeName} storeOptions={storeOptions} selectedStoreId={selectedStoreId} />;
}
