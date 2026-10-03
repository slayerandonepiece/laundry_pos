import { notFound } from 'next/navigation';
import { getOutletDetailForAdmin } from '@/server/services/outlets';
import { listOrders } from '@/server/services/orders';
import { listExpenses } from '@/server/services/expenses';
import { listProducts } from '@/server/services/products';
import { listEmployees } from '@/server/services/employees';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import OutletDetail from '@/features/admin/components/OutletDetail';
import type { Order, Expense, Product, Employee } from '@/features/admin/admin.types';

export default async function Page({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  let outlet;
  let serverOrders: Order[] = [];
  let serverExpenses: Expense[] = [];
  let serverProducts: Product[] = [];
  let serverEmployees: Employee[] = [];

  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER', undefined, { allowLockedReadOnly: true });
    const [foundOutlet, orders, expenses, products, employees] = await Promise.all([
      getOutletDetailForAdmin(outletId, session.storeId),
      listOrders(session.storeId, { outletId }),
      listExpenses(session.storeId, { outletId }),
      listProducts(session.storeId),
      listEmployees(session.storeId),
    ]);
    outlet = foundOutlet;
    serverOrders = orders;
    serverExpenses = expenses;
    serverProducts = products;
    serverEmployees = employees.filter(e => e.outlets?.some(o => o.id === outletId));
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  
  if (!outlet) {
    notFound();
  }

  return (
    <div className="ad-screen-content">
      <OutletDetail
        outlet={outlet}
        serverOrders={serverOrders}
        serverExpenses={serverExpenses}
        serverProducts={serverProducts}
        serverEmployees={serverEmployees}
      />
    </div>
  );
}
