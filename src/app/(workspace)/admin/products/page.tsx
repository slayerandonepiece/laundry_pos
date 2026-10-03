import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { listProducts } from '@/server/services/products';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';

export default async function Page() {
  let serverProducts: Awaited<ReturnType<typeof listProducts>> = [];
  try {
    // Products always requires exactly one specific store — no "All stores"
    // view exists outside Dashboard (Item 2). A multi-store owner's choice
    // (persisted header selection, or an auto-picked default) is resolved
    // here and re-verified by requireStoreSession() below, never trusted as-is.
    // The chrome's own store-switcher display is resolved independently in
    // src/app/(workspace)/layout.tsx.
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER', undefined, { allowLockedReadOnly: true });
    serverProducts = await listProducts(session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="products" serverProducts={serverProducts} />;
}
