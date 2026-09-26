import { listOrders } from '@/server/services/orders';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';
import { listOutletsForStore } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { OrdersClient } from '@/features/admin/components/OrderTable';
import type { StorePaymentMethod } from '@/features/admin/admin.types';

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverPaymentMethods: StorePaymentMethod[] = [];
  let outlets: { id: string; name: string }[] = [];
  
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined);
    let storeOutlets: Awaited<ReturnType<typeof listOutletsForStore>>;
    let orgMethods: Awaited<ReturnType<typeof listOrganizationPaymentMethods>>;
    [serverOrders, orgMethods, storeOutlets] = await Promise.all([
      listOrders(session.storeId), 
      listOrganizationPaymentMethods(session.storeId),
      listOutletsForStore(session.storeId)
    ]);
    serverPaymentMethods = orgMethods
      .filter(method => method.enabled)
      .map(method => ({ id: method.id, storeId: session.storeId, name: method.name, active: true }));
    outlets = storeOutlets.map(outlet => ({ id: outlet.id, name: outlet.displayName }));
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  
  return <OrdersClient serverOrders={serverOrders} paymentMethods={serverPaymentMethods} outlets={outlets} />;
}
