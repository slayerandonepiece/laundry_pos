import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listOrders } from '@/server/services/orders';
import { listExpenses } from '@/server/services/expenses';
import { listProducts } from '@/server/services/products';
import { requireStoreSession, resolveStoreSelection, AuthError, type StoreOption } from '@/server/auth/session';

async function loadOneStore(storeId?: string) {
  const session = await requireStoreSession(storeId, 'OWNER');
  const [orders, expenses, products] = await Promise.all([listOrders(session.storeId), listExpenses(session.storeId), listProducts(session.storeId)]);
  return { storeName: session.storeName, orders, expenses, products };
}

export default async function Page() {
  let serverOrders: Awaited<ReturnType<typeof listOrders>> = [];
  let serverExpenses: Awaited<ReturnType<typeof listExpenses>> = [];
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  let storeName: string | undefined;
  let storeOptions: StoreOption[] | undefined;
  let selectedStoreId: string | undefined;
  let allStoresSelected = false;
  try {
    // Dashboard is the only screen that ever offers "All stores" (Item 2).
    const selection = await resolveStoreSelection(true);
    if (selection?.multiStore) {
      storeOptions = selection.options;
      selectedStoreId = selection.storeId;
      allStoresSelected = selection.allStoresSelected;
      if (selection.allStoresSelected) {
        // Sum the same metrics the single-store Dashboard already shows,
        // across every store this owner is an active member of. Each store
        // is independently re-verified through requireStoreSession — a
        // store that's individually blocked (locked/archived/payment-lapsed)
        // contributes nothing rather than failing the whole aggregate, same
        // as how a single-store owner sees an empty dashboard when blocked.
        const perStore = await Promise.all(
          selection.options.map(option =>
            loadOneStore(option.storeId).catch(error => {
              if (error instanceof AuthError) return { storeName: '', orders: [], expenses: [], products: [] };
              throw error;
            })
          )
        );
        serverOrders = perStore.flatMap(store => store.orders);
        serverExpenses = perStore.flatMap(store => store.expenses);
        serverProducts = perStore.flatMap(store => store.products);
        storeName = 'All stores';
      } else {
        ({ storeName, orders: serverOrders, expenses: serverExpenses, products: serverProducts } = await loadOneStore(selection.storeId));
      }
    } else {
      ({ storeName, orders: serverOrders, expenses: serverExpenses, products: serverProducts } = await loadOneStore());
    }
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return (
    <AdminScreenContainer
      screen="dashboard"
      serverOrders={serverOrders}
      serverExpenses={serverExpenses}
      serverProducts={serverProducts}
      storeName={storeName}
      storeOptions={storeOptions}
      selectedStoreId={selectedStoreId}
      allStoresSelected={allStoresSelected}
    />
  );
}
