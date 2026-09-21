import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listExpenses } from '@/server/services/expenses';
import { listProducts } from '@/server/services/products';
import { requireStoreSession, resolveOutletSelection, AuthError } from '@/server/auth/session';
import type { AllowedOutlet } from '@/server/auth/session';
import { getDailyOutletSummaries } from '@/server/services/dashboard-rollups';
import { todayIST, addDays } from '@/server/dates';

export default async function Page() {
  let dashboardLoadFailed = false;
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  let serverSummaries: Awaited<ReturnType<typeof getDailyOutletSummaries>> = [];
  let serverOutlets: AllowedOutlet[] = [];
  let allOutletsSelected = false;
  let selectedOutletId: string | undefined;
  let outletName: string | undefined;

  try {
    const session = await requireStoreSession(undefined, 'OWNER');
    const selection = await resolveOutletSelection(session, true);
    serverOutlets = selection.options;
    selectedOutletId = selection.outletId ?? undefined;
    allOutletsSelected = selection.allOutletsSelected;

    // Resolve the display name of the selected outlet for single-outlet header copy.
    // When allOutletsSelected the header shows "All outlets" via the OutletSwitcher.
    if (!allOutletsSelected && selection.outletId) {
      const found = selection.options.find(o => o.id === selection.outletId);
      outletName = found?.displayName;
    } else if (!allOutletsSelected && selection.options.length === 1) {
      // Single-outlet organization — no switcher, show the one outlet's name.
      outletName = selection.options[0].displayName;
    }

    const [orders, expenses, products] = await Promise.all([
      listOrders(
        session.storeId,
        selection.outletId ? { outletId: selection.outletId } : undefined,
      ),
      listExpenses(
        session.storeId,
        selection.outletId ? { outletId: selection.outletId } : undefined,
      ),
      listProducts(session.storeId),
    ]);
    serverOrders = orders;
    serverExpenses = expenses;
    serverProducts = products;

    // Fetch per-outlet daily rollups only for multi-outlet "All outlets" view.
    // The 2-day window (today + yesterday) is sufficient for the comparison badges.
    if (selection.options.length > 1 && selection.allOutletsSelected) {
      serverSummaries = await getDailyOutletSummaries(session.storeId, {
        fromDate: addDays(todayIST(), -1),
        toDate: todayIST(),
      });
    }
  } catch (error) {
    if (!(error instanceof AuthError)) dashboardLoadFailed = true;
  }

  return (
    <AdminScreenContainer
      screen="dashboard"
      dashboardLoadFailed={dashboardLoadFailed}
      serverOrders={serverOrders}
      serverExpenses={serverExpenses}
      serverProducts={serverProducts}
      serverSummaries={serverSummaries}
      dashboardOutlets={serverOutlets}
      selectedOutletId={selectedOutletId}
      allOutletsSelected={allOutletsSelected}
      outletName={outletName}
    />
  );
}
