import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { listPlatformActivity } from '@/server/services/activity';
import { listStores } from '@/server/services/stores';
import PageHeading from '@/features/super-admin/components/PageHeading';
import PlatformActivityView from '@/features/super-admin/components/PlatformActivityView';

export default async function ActivityPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }

  const [entries, stores] = await Promise.all([
    listPlatformActivity(100),
    listStores(),
  ]);

  return (
    <>
      <PageHeading
        icon="history"
        title="Activity"
        subtitle="Every super admin action, across every organization. This is the platform-wide log — an organization's own Activity tab shows only its own rows."
      />
      <PlatformActivityView entries={entries} stores={stores} />
    </>
  );
}
