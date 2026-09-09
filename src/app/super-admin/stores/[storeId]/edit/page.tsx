import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getStore } from '@/server/services/stores';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import StoreEditFull from '@/features/super-admin/components/StoreEditFull';

export default async function Page({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const store = await getStore(storeId);
  if (!store) notFound();
  return (
    <SuperAdminPageShell title={store.name} subtitle="Edit store" name={session.name}>
      <section className="ad-card">
        <div className="ad-card-heading">
          <div><h2>Edit store</h2><p>Update {store.name}&apos;s contact details.</p></div>
          <Link className="ad-button ad-secondary" href={`/super-admin/stores/${store.id}`}>← Back to store</Link>
        </div>
        <StoreEditFull store={store} />
      </section>
    </SuperAdminPageShell>
  );
}
