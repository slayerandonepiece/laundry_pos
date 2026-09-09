import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore, listStoreInvoices } from '@/server/services/stores';
import { listPlans } from '@/server/services/subscription-plans';
import { listStoreMembers } from '@/server/services/platform-users';
import StoreDetailShell from '@/features/super-admin/components/StoreDetailShell';
import StoreSubscriptionTab from '@/features/super-admin/components/StoreSubscriptionTab';

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
  const [invoices, plans, members] = await Promise.all([listStoreInvoices(storeId), listPlans(), listStoreMembers(storeId)]);
  return (
    <StoreDetailShell store={store} memberCount={members.length}>
      <StoreSubscriptionTab store={store} invoices={invoices} plans={plans.filter(p => !p.archivedAt)} />
    </StoreDetailShell>
  );
}
