'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money } from '@/features/admin/admin.data';
import Icon from './Icon';
import RowMenu from './RowMenu';
import type { BillingCycle, SubscriptionPlanListItem } from '../types';

const CYCLE_LABEL: Record<BillingCycle, string> = { ANNUAL: 'Yearly' };

export default function SubscriptionPlansTable({ plans, onEdit, onArchive, onDuplicate, onDelete }: {
  plans: SubscriptionPlanListItem[];
  onEdit: (plan: SubscriptionPlanListItem) => void;
  onArchive: (plan: SubscriptionPlanListItem) => void;
  onDuplicate: (plan: SubscriptionPlanListItem) => void;
  onDelete: (plan: SubscriptionPlanListItem) => void;
}) {
  const router = useRouter();
  if (!plans.length) return <div className="card"><div className="empty">
    <span className="ic l"><Icon name="card" size="l" /></span>
    <h3>No plans match this view</h3>
    <p>Create a plan to reuse its terms across organizations.</p>
  </div></div>;

  return <>
    <div className="tablecard">
      <table>
        <thead><tr><th>Plan</th><th className="right">Deposit</th><th className="right">Annual fee</th><th>Billing cycle</th><th>Organizations using it</th><th>Status</th><th className="right">Actions</th></tr></thead>
        <tbody>
          {plans.map(plan => (
            <tr key={plan.id}>
              <td><Link href={`/super-admin/subscriptions/${plan.id}`}><strong>{plan.name}</strong></Link>{plan.notes && <small>{plan.notes}</small>}</td>
              <td className="right num">{plan.depositWaivedByDefault ? <span className="chip" style={{ color: 'var(--muted)' }}>Waived</span> : money(plan.depositAmount)}</td>
              <td className="right num">{money(plan.annualFeeAmount)}</td>
              <td>{CYCLE_LABEL[plan.billingCycle]}</td>
              <td><span className="chip">{plan.storeCount} org{plan.storeCount === 1 ? '' : 's'}</span></td>
              <td><span className={'badge ' + (plan.archivedAt ? 'gray' : 'good')}>{plan.archivedAt ? 'Archived' : 'Active'}</span></td>
              <td>
                <div className="rowacts">
                  {!plan.archivedAt && <button type="button" className="icon-btn" aria-label={`Edit ${plan.name}`} onClick={() => onEdit(plan)}><Icon name="edit" /></button>}
                  {!plan.archivedAt && (
                    <RowMenu items={[
                      { label: 'View plan', icon: 'eye', onClick: () => router.push(`/super-admin/subscriptions/${plan.id}`) },
                      { label: 'Edit plan', icon: 'edit', onClick: () => onEdit(plan) },
                      { label: 'Duplicate plan', icon: 'card', onClick: () => onDuplicate(plan) },
                      { label: 'Archive plan', icon: 'archive', onClick: () => onArchive(plan), danger: true },
                      ...(plan.storeCount === 0 ? [{ label: 'Delete plan', icon: 'trash' as const, onClick: () => onDelete(plan), danger: true }] : []),
                    ]} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="notice" style={{ marginTop: 14 }}>
      <Icon name="check" size="s" />
      <span>A plan sets the default deposit and fee. Individual organizations can still override the deposit at onboarding. A plan in use can be archived but not deleted until every organization is moved off it.</span>
    </div>
  </>;
}
