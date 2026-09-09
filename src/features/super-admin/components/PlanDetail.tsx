'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import ConfirmationDialog from '@/features/admin/components/ConfirmationDialog';
import { money, dateLabel } from '@/features/admin/admin.data';
import Icon from './Icon';
import PlanEditor from './PlanEditor';
import PlanArchiveDialog from './PlanArchiveDialog';
import { duplicatePlanAction, deletePlanAction } from '../actions/subscription-plans.actions';
import type { SubscriptionPlanDetail, SubscriptionPlanListItem } from '../types';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 2).toUpperCase();
}

export default function PlanDetail({ plan, otherPlans }: { plan: SubscriptionPlanDetail; otherPlans: SubscriptionPlanListItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');

  const depositsHeld = plan.stores.reduce((sum, s) => sum + s.depositAmount, 0);

  function duplicate() {
    duplicatePlanAction(plan.id).then(result => {
      if (!result.ok || !result.plan) { setNotice(result.error || 'Could not duplicate this plan.'); setTimeout(() => setNotice(''), 4000); return; }
      setNotice(`${result.plan.name} created`);
      router.push(`/super-admin/subscriptions/${result.plan.id}`);
    });
  }

  function confirmDelete() {
    deletePlanAction(plan.id).then(result => {
      setDeleting(false);
      if (!result.ok) { setNotice(result.error || 'Could not delete this plan.'); setTimeout(() => setNotice(''), 4000); return; }
      router.push('/super-admin/subscriptions');
    });
  }

  return <>
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <Link className="backlink" href="/super-admin/subscriptions"><Icon name="arrowLeft" size="s" />Back to plans</Link>

    <div className="phead" style={{ marginBottom: 14 }}>
      <div className="phead-l">
        <span className="phead-ic"><Icon name="card" /></span>
        <div>
          <h1>{plan.name} <span className={'badge ' + (plan.archivedAt ? 'gray' : 'good')}>{plan.archivedAt ? 'Archived' : 'Active'}</span></h1>
          <p>Created {dateLabel(plan.createdAt)}{plan.notes ? ` · ${plan.notes}` : ''}</p>
        </div>
      </div>
      {!plan.archivedAt && (
        <div className="phead-r">
          <button type="button" className="btn outline" onClick={duplicate}><Icon name="card" size="s" />Duplicate</button>
          <button type="button" className="btn outline" onClick={() => setArchiving(true)}><Icon name="archive" size="s" />Archive</button>
          <button type="button" className="btn" onClick={() => setEditing(true)}><Icon name="edit" size="s" />Edit plan</button>
        </div>
      )}
      {plan.archivedAt && plan.storeCount === 0 && (
        <div className="phead-r">
          <button type="button" className="btn outline danger-outline" onClick={() => setDeleting(true)}><Icon name="trash" size="s" />Delete plan</button>
        </div>
      )}
    </div>

    <div className="split">
      <div>
        <div className="card">
          <div className="card-head"><h2><Icon name="card" />Terms</h2></div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            <div className="kv"><span>One-time deposit</span><strong className="num">{money(plan.depositAmount)}</strong></div>
            <div className="kv"><span>Annual maintenance fee</span><strong className="num">{money(plan.annualFeeAmount)} / yr</strong></div>
            <div className="kv"><span>Billing cycle</span><strong>Yearly</strong></div>
            <div className="kv"><span>Deposit waived by default</span><strong>{plan.depositWaivedByDefault ? 'Yes' : 'No'}</strong></div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div><h2><Icon name="store" />Stores on this plan</h2><p>{plan.stores.length} store{plan.stores.length === 1 ? '' : 's'} — deposit shown reflects any per-store override</p></div></div>
          {!plan.stores.length ? (
            <div className="card-body"><div className="empty">
              <span className="ic l"><Icon name="store" size="l" /></span>
              <h3>No stores yet</h3>
              <p>Attach this plan when onboarding a store, or move an existing one onto it.</p>
            </div></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Store</th><th>Owner</th><th>Onboarded</th><th className="right">Deposit charged</th><th>Status</th></tr></thead>
                <tbody>
                  {plan.stores.map(store => (
                    <tr key={store.id}>
                      <td><div className="who"><span className="av sq">{initials(store.name)}</span><Link href={`/super-admin/stores/${store.id}`}><strong>{store.name}</strong></Link></div></td>
                      <td>{store.ownerName}</td>
                      <td className="num">{dateLabel(store.onboardedAt)}</td>
                      <td className="right num">{money(store.depositAmount)}{store.depositAmount !== plan.depositAmount && <small style={{ color: 'var(--muted)' }}> override</small>}</td>
                      <td><span className={'badge ' + (store.status === 'LOCKED' ? 'bad' : 'good')}>{store.status === 'LOCKED' ? 'Locked' : 'Active'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-head"><h3>At a glance</h3></div>
          <div className="card-body">
            <div className="kv"><span>Stores using it</span><strong className="num">{plan.stores.length}</strong></div>
            <div className="kv"><span>Deposits held</span><strong className="num">{money(depositsHeld)}</strong></div>
            <div className="kv"><span>Annual revenue</span><strong className="num">{money(plan.annualFeeAmount * plan.stores.length)}</strong></div>
            <div className="kv"><span>Last used</span><strong className="num">{plan.lastUsedAt ? dateLabel(plan.lastUsedAt) : '—'}</strong></div>
          </div>
        </div>
      </div>
    </div>

    {editing && (
      <Dialog title={`Edit ${plan.name}`} description="Changes apply to stores using this plan at their next renewal." onClose={() => setEditing(false)} warnOnChanges>
        <PlanEditor plan={plan} onSaved={updated => { setEditing(false); setNotice(`${updated.name} updated`); router.refresh(); setTimeout(() => setNotice(''), 4000); }} />
      </Dialog>
    )}
    {archiving && (
      <PlanArchiveDialog
        plan={plan}
        otherPlans={otherPlans.filter(p => p.id !== plan.id && !p.archivedAt)}
        onCancel={() => setArchiving(false)}
        onDone={() => { setArchiving(false); setNotice(`${plan.name} archived`); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
        onDeleted={() => { setArchiving(false); router.push('/super-admin/subscriptions'); }}
      />
    )}
    {deleting && (
      <ConfirmationDialog
        title={`Delete ${plan.name}?`}
        description="This permanently removes the plan. Only possible because zero stores currently reference it — this can't be undone."
        confirmLabel="Delete plan"
        onCancel={() => setDeleting(false)}
        onConfirm={confirmDelete}
      />
    )}
  </>;
}
