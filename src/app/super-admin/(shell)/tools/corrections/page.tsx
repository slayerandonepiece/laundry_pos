import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listStores } from '@/server/services/stores';
import PageHeading from '@/features/super-admin/components/PageHeading';
import OrderCorrections from '@/features/super-admin/components/OrderCorrections';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const stores = await listStores();
  return <>
    <PageHeading icon="edit" title="Order corrections" subtitle="Fix a wrong customer or payment on a delivered order. Every correction is audited." />
    <OrderCorrections organizations={stores.map(store => ({ id: store.id, name: store.name, orgCode: store.orgCode }))} />
  </>;
}
