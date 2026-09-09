import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getDashboardStats, listStores } from '@/server/services/stores';
import { listUsers } from '@/server/services/platform-users';
import { listPlans } from '@/server/services/subscription-plans';
import { todayIST } from '@/server/dates';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import SuperAdminDashboard from '@/features/super-admin/components/SuperAdminDashboard';

export default async function Page() {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [stats, stores, users, plans] = await Promise.all([getDashboardStats(), listStores(), listUsers(), listPlans()]);
  return (
    <SuperAdminPageShell title="Dashboard" subtitle="How the platform is doing — stores, users and subscriptions at a glance." name={session.name}>
      <SuperAdminDashboard stats={stats} stores={stores} users={users} plans={plans} today={todayIST()} />
    </SuperAdminPageShell>
  );
}
