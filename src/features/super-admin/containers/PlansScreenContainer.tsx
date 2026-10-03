'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '../components/Dialog';
import ConfirmationDialog from '@/features/admin/components/ConfirmationDialog';
import PlansEmptyState from '../components/PlansEmptyState';
import SubscriptionPlansTable from '../components/SubscriptionPlansTable';
import PlanEditor from '../components/PlanEditor';
import PlanArchiveDialog from '../components/PlanArchiveDialog';
import { duplicatePlanAction, deletePlanAction } from '../actions/subscription-plans.actions';
import type { SubscriptionPlanListItem } from '../types';

export default function PlansScreenContainer({ plans }: { plans: SubscriptionPlanListItem[] }) {
  const router = useRouter();
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanListItem | null>(null);
  const [archivingPlan, setArchivingPlan] = useState<SubscriptionPlanListItem | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlanListItem | null>(null);
  const [notice, setNotice] = useState('');

  function duplicate(plan: SubscriptionPlanListItem) {
    duplicatePlanAction(plan.id).then(result => {
      if (!result.ok || !result.plan) { setNotice(result.error || 'Could not duplicate this plan.'); setTimeout(() => setNotice(''), 4000); return; }
      setNotice(`${result.plan.name} created`); router.refresh(); setTimeout(() => setNotice(''), 4000);
    });
  }

  function confirmDelete() {
    if (!deletingPlan) return;
    const name = deletingPlan.name;
    deletePlanAction(deletingPlan.id).then(result => {
      setDeletingPlan(null);
      if (!result.ok) { setNotice(result.error || 'Could not delete this plan.'); setTimeout(() => setNotice(''), 4000); return; }
      setNotice(`${name} deleted`); router.refresh(); setTimeout(() => setNotice(''), 4000);
    });
  }

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    {!plans.length
      ? <PlansEmptyState />
      : <SubscriptionPlansTable plans={plans} onEdit={setEditingPlan} onArchive={setArchivingPlan} onDuplicate={duplicate} onDelete={setDeletingPlan} />}
    {editingPlan && (
      <Dialog title={`Edit ${editingPlan.name}`} description="Changes apply to organizations using this plan at their next renewal." onClose={() => setEditingPlan(null)} warnOnChanges>
        <PlanEditor plan={editingPlan} onSaved={plan => { setEditingPlan(null); setNotice(`${plan.name} updated`); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
    {archivingPlan && (
      <PlanArchiveDialog
        plan={archivingPlan}
        otherPlans={plans.filter(p => p.id !== archivingPlan.id && !p.archivedAt)}
        onCancel={() => setArchivingPlan(null)}
        onDone={() => { setNotice(`${archivingPlan.name} archived`); setArchivingPlan(null); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
        onDeleted={() => { setNotice(`${archivingPlan.name} deleted`); setArchivingPlan(null); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
    {deletingPlan && (
      <ConfirmationDialog
        title={`Delete ${deletingPlan.name}?`}
        description="This permanently removes the plan. Only possible because zero organizations currently reference it — this can't be undone."
        confirmLabel="Delete plan"
        onCancel={() => setDeletingPlan(null)}
        onConfirm={confirmDelete}
      />
    )}
  </>;
}
