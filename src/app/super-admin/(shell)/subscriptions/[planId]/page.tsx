import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getPlan, listPlans } from '@/server/services/subscription-plans';
import PlanDetail from '@/features/super-admin/components/PlanDetail';

export default async function Page({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const plan = await getPlan(planId);
  if (!plan) notFound();
  const plans = await listPlans();
  return <PlanDetail plan={plan} otherPlans={plans} />;
}
