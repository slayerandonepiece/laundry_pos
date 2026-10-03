import { redirect } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getDashboardStats, listStores } from '@/server/services/stores';
import { listUsers } from '@/server/services/platform-users';
import { listPlans } from '@/server/services/subscription-plans';
import { listPlatformActivity } from '@/server/services/activity';
import { todayIST } from '@/server/dates';
import PageHeading from '@/features/super-admin/components/PageHeading';
import SuperAdminDashboard from '@/features/super-admin/components/SuperAdminDashboard';

export default async function Page() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const [stats, stores, users, plans, recentActivity] = await Promise.all([
    getDashboardStats(),
    listStores(),
    listUsers(),
    listPlans(),
    listPlatformActivity(5),
  ]);
  return (
    <>
      <PageHeading icon="dashboard" title="Dashboard" subtitle="How the platform is doing — organizations, users and subscriptions at a glance." />
      <SuperAdminDashboard stats={stats} stores={stores} users={users} plans={plans} today={todayIST()} recentActivity={recentActivity} />
    </>
  );
}
