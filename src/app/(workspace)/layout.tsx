import { resolveStoreSelection } from '@/server/auth/session';
import AdminChrome from '@/features/admin/components/AdminChrome';

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Dashboard is the only screen that ever offers "All stores" (Item 2), but
  // resolving with dashboard=true here is harmless for every other screen —
  // AdminChrome only treats allStoresSelected as meaningful while the
  // current route is the dashboard, and every other screen's own page still
  // independently calls resolveStoreSelection(false)/requireStoreSession for
  // its actual data, exactly as before this layout existed.
  const selection = await resolveStoreSelection(true);
  const storeOptions = selection?.multiStore ? selection.options : undefined;
  const selectedStoreId = selection?.storeId;
  const allStoresSelected = selection?.allStoresSelected ?? false;
  const storeName = selection?.options.find(option => option.storeId === selection.storeId)?.storeName;
  return (
    <AdminChrome storeName={storeName} storeOptions={storeOptions} selectedStoreId={selectedStoreId} allStoresSelected={allStoresSelected}>
      {children}
    </AdminChrome>
  );
}
