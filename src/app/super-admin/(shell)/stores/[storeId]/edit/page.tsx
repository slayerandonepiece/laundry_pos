import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import { getOrgLifecycleFacts, getArchiveEligibility } from '@/server/services/store-lifecycle';
import Icon from '@/features/super-admin/components/Icon';
import StoreEditFull from '@/features/super-admin/components/StoreEditFull';

export default async function Page({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const store = await getStore(storeId);
  if (!store) notFound();
  const [lifecycle, eligibility] = await Promise.all([
    getOrgLifecycleFacts(storeId),
    getArchiveEligibility(storeId),
  ]);
  return (
    <>
      <Link className="backlink" href={`/super-admin/stores/${store.id}`}><Icon name="arrowLeft" size="s" />Back to {store.name}</Link>
      <div className="phead">
        <div className="phead-l">
          <div><h1>Edit organization</h1><p>Update {store.name}&apos;s contact details.</p></div>
        </div>
      </div>
      <StoreEditFull store={store} lifecycle={lifecycle} eligibility={eligibility} />
    </>
  );
}
