import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import PageHeading from '@/features/super-admin/components/PageHeading';
import OrderImportGrid from '@/features/super-admin/components/OrderImportGrid';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  return <>
    <PageHeading icon="export" title="Import history" subtitle="Enter past orders for an organization. Each is saved as delivered and paid on the date you choose." />
    <OrderImportGrid />
  </>;
}
