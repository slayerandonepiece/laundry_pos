import { redirect } from 'next/navigation';
import AdminScreenContainer from '@/features/admin/containers/AdminScreenContainer';
import { requireStoreSession, resolveStoreSelection, AuthError } from '@/server/auth/session';
import { getStore, listStoreInvoices } from '@/server/services/stores';

export default async function Page() {
  let storeInfo: Awaited<ReturnType<typeof getStore>> | null = null;
  let invoices: Awaited<ReturnType<typeof listStoreInvoices>> = [];
  try {
    const selection = await resolveStoreSelection();
    const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, undefined, undefined, { allowLockedReadOnly: true });
    if (session.storeRole !== 'OWNER') redirect('/admin/profile');
    [storeInfo, invoices] = await Promise.all([getStore(session.storeId), listStoreInvoices(session.storeId)]);
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  return <AdminScreenContainer screen="profile" profileSection="billing" storeInfo={storeInfo} serverInvoices={invoices} />;
}
