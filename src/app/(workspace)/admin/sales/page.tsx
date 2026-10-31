import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { getOrder, searchOrders, type SearchOrdersResult } from '@/server/services/orders';
import { listProducts } from '@/server/services/products';
import { listOrganizationPaymentMethods } from '@/server/services/platform-payment-methods';
import { listOutletsForStoreAdmin } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, resolveOutletSelection, AuthError } from '@/server/auth/session';
import { cookies } from 'next/headers';
import { SALES_PERIOD_COOKIE, decodeSalesPeriod, parseSalesParams } from '@/features/admin/sales-query';
import type { Order, PaymentMethodOption } from '@/features/admin/admin.types';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A period in the URL wins; otherwise the browser's last choice (cookie), else This quarter.
  const remembered = typeof params.period === 'string' ? {} : decodeSalesPeriod((await cookies()).get(SALES_PERIOD_COOKIE)?.value);
  const salesQuery = parseSalesParams({ ...params, ...remembered });
  const orderCode = typeof params.order === 'string' ? params.order : '';
  let serverStoreId = '';
  let salesResult: SearchOrdersResult = { orders: [], total: 0, page: 1, pageSize: salesQuery.size, hasOrders: false };
  let linkedOrder: Order | null = null;
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  let serverPaymentMethods: PaymentMethodOption[] = [];
  let serverOutlets: Awaited<ReturnType<typeof listOutletsForStoreAdmin>> = [];
  try {
    // Sales always requires one specific store — no "All stores" view
    // outside Dashboard (Item 2). Employees always have exactly one active
    // membership (Item 1), so resolveStoreSelection is a no-op for them —
    // this selector only ever surfaces for multi-store owners. The chrome's
    // own store-switcher display is resolved independently in
    // src/app/(workspace)/layout.tsx.
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, undefined, undefined, { allowLockedReadOnly: true });
    serverStoreId = session.storeId;
    const outletSelection = session.storeRole === 'EMPLOYEE' ? await resolveOutletSelection(session) : null;
    // Owners see the whole store; employees only their currently authorized outlet (none: nothing).
    const outletId = session.storeRole === 'OWNER' ? undefined : outletSelection?.outletId ?? undefined;
    const canRead = session.storeRole === 'OWNER' || Boolean(outletId);
    const [result, linked, products, orgMethods] = await Promise.all([
      canRead ? searchOrders(session.storeId, { outletId, from: salesQuery.from, to: salesQuery.to, q: salesQuery.q || undefined, work: salesQuery.work || undefined, pay: salesQuery.pay || undefined, due: salesQuery.due || undefined, page: salesQuery.page, pageSize: salesQuery.size as 10 | 25 | 50 | 100 }) : Promise.resolve(salesResult),
      // A ?order= link opens that order even when it is not on the current page.
      canRead && orderCode ? getOrder(session.storeId, orderCode) : Promise.resolve(null),
      listProducts(session.storeId),
      listOrganizationPaymentMethods(session.storeId),
    ]);
    salesResult = result;
    linkedOrder = linked && (!outletId || linked.outletId === outletId) ? linked : null;
    serverProducts = products;
    serverPaymentMethods = orgMethods
      .filter(method => method.enabled)
      .map(method => ({ id: method.id, storeId: session.storeId, name: method.name, code: method.code, stage: method.stage, active: true }));
    // Owners pick the outlet on New sale when the store has more than one active outlet.
    serverOutlets = (await listOutletsForStoreAdmin(session.storeId)).filter(outlet => session.storeRole === 'OWNER' || outlet.id === outletSelection?.outletId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="sales" serverStoreId={serverStoreId} serverOrders={salesResult.orders} serverProducts={serverProducts} serverPaymentMethods={serverPaymentMethods} serverOutlets={serverOutlets}
    sales={{ query: { ...salesQuery, page: salesResult.page }, total: salesResult.total, hasOrders: salesResult.hasOrders, linkedOrder }} />;
}
