import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getPlan, listPlans } from '@/server/services/subscription-plans';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import PlanDetail from '@/features/super-admin/components/PlanDetail';
import Icon from '@/features/super-admin/components/Icon';

export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const plan = await getPlan(planId);
  if (!plan) notFound();
  const plans = await listPlans();
  const breadcrumb = <>Platform <Icon name="chevronRight" /> <Link href="/super-admin/subscriptions">Subscriptions</Link> <Icon name="chevronRight" /> <b>{plan.name}</b></>;
  return (
    <SuperAdminPageShell title={plan.name} subtitle="Plan detail" name={session.name} breadcrumb={breadcrumb} hidePhead>
      <PlanDetail plan={plan} otherPlans={plans} />
    </SuperAdminPageShell>
  );
}
