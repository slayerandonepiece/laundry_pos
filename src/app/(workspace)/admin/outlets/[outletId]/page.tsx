import { notFound } from 'next/navigation';
import { getOutletDetailForAdmin } from '@/server/services/outlets';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import OutletDetail from '@/features/admin/components/OutletDetail';

export default async function Page({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  let outlet;
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER');
    outlet = await getOutletDetailForAdmin(outletId, session.storeId);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  
  if (!outlet) {
    notFound();
  }

  return <div className="ad-screen-content"><OutletDetail outlet={outlet} /></div>;
}
