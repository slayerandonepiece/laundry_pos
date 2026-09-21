import { listOrders } from '@/server/services/orders';
import { listProducts } from '@/server/services/products';
import { listStorePaymentMethods } from '@/server/services/payment-methods';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { OrdersClient } from '@/features/admin/components/OrderTable';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverPaymentMethods: Awaited<ReturnType<typeof listStorePaymentMethods>> = [];
  let storeOptions: {storeId: string, storeName: string}[] = [];
  let multiStore = false;
  let isOwner = false;
  
  try {
    const selection = await resolveStoreSelection();
    if (selection) {
      storeOptions = selection.options;
      multiStore = selection.multiStore;
    }
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
    isOwner = session.storeRole === 'OWNER';
    [serverOrders, serverPaymentMethods] = await Promise.all([
      listOrders(session.storeId), 
      listStorePaymentMethods(session.storeId)
    ]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  
  return <OrdersClient serverOrders={serverOrders} paymentMethods={serverPaymentMethods as any} storeOptions={storeOptions} />;
}
