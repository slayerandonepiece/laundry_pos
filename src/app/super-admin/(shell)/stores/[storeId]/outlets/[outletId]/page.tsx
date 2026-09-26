import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { getOutletDetailForAdmin } from '@/server/services/outlets';
import OutletDetailView from '@/features/super-admin/components/OutletDetailView';

export default async function Page({ params }: { params: Promise<{ storeId: string; outletId: string }> }) {
  const { storeId, outletId } = await params;
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const store = await getStore(storeId);
  if (!store) notFound();
  const outlet = await getOutletDetailForAdmin(outletId, storeId);
  if (!outlet) notFound();
  return <OutletDetailView store={store} outlet={outlet} />;
}
