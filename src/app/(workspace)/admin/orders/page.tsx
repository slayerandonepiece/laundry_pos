import { listOrders } from '@/server/services/orders';
import { listStorePaymentMethods } from '@/server/services/payment-methods';
import { listOutletsForStore } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { OrdersClient } from '@/features/admin/components/OrderTable';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverPaymentMethods: Awaited<ReturnType<typeof listStorePaymentMethods>> = [];
  let outlets: { id: string; name: string }[] = [];
  
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
    let storeOutlets: Awaited<ReturnType<typeof listOutletsForStore>>;
    [serverOrders, serverPaymentMethods, storeOutlets] = await Promise.all([
      listOrders(session.storeId), 
      listStorePaymentMethods(session.storeId),
      listOutletsForStore(session.storeId)
    ]);
    outlets = storeOutlets.map(outlet => ({ id: outlet.id, name: outlet.displayName }));
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  
  return <OrdersClient serverOrders={serverOrders} paymentMethods={serverPaymentMethods} outlets={outlets} />;
}
