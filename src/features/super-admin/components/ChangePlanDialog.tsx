'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose } from './Dialog';
import { changeStorePlanAction } from '../actions/subscription-plans.actions';
import PlanPickerCards from './PlanPickerCards';
import type { StoreDetail, SubscriptionPlanListItem } from '../types';

export default function ChangePlanDialog({ store, plans, onSaved }: {
  store: StoreDetail;
  plans: SubscriptionPlanListItem[];
  onSaved: () => void;
}) {
  const onCancel = useDialogClose();
  const [planId, setPlanId] = useState(store.planId ?? '');
  const [discountAmount, setDiscountAmount] = useState(String(store.discountAmount / 100));
  const [depositAmount, setDepositAmount] = useState(String(store.depositAmount / 100));
  const [annualFeeAmount, setAnnualFeeAmount] = useState(String(store.annualFeeAmount / 100));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedPlan = plans.find(p => p.id === planId);

  function submit() {
    if (!Number.isFinite(Number(depositAmount)) || Number(depositAmount) < 0) return setError('Enter a valid deposit amount.');
    if (!Number.isFinite(Number(annualFeeAmount)) || Number(annualFeeAmount) < 0) return setError('Enter a valid annual fee.');
    setBusy(true);
    setError('');
    changeStorePlanAction(store.id, {
      planId: planId || null,
      depositAmount: Math.round(Number(depositAmount) * 100),
      annualFeeAmount: Math.round(Number(annualFeeAmount) * 100),
      discountAmount: Math.round(Number(discountAmount) * 100),
      reason: reason.trim() || undefined,
    })
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not change this plan. Try again.'); setBusy(false); return; }
        onSaved();
      })
      .catch(() => { setError('Could not change this plan. Try again.'); setBusy(false); });
  }

  function applyPlan(id: string) {
    setPlanId(id);
    const plan = plans.find(p => p.id === id);
    if (plan) {
      setDepositAmount(String((plan.depositWaivedByDefault ? 0 : plan.depositAmount) / 100));
      setAnnualFeeAmount(String(plan.annualFeeAmount / 100));
    }
  }

  return <div className="ad-form">
    <label style={{ marginBottom: 0 }}>Plan</label>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className={'radio-card' + (planId === '' ? ' on' : '')}>
        <input type="radio" name="plan-picker" checked={planId === ''} onChange={() => setPlanId('')} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <span className="radio" aria-hidden="true" />
        <div><b>No plan — custom terms</b><small>Set deposit and fee manually below</small></div>
      </label>
      <PlanPickerCards plans={plans} value={planId} onChange={applyPlan} currentPlanId={store.planId} />
    </div>

    <div className="ad-form-grid">
      <label>Deposit (₹)<input type="number" min="0" step="1" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></label>
      <label>Annual maintenance (₹)<input type="number" min="0" step="1" value={annualFeeAmount} onChange={e => setAnnualFeeAmount(e.target.value)} /></label>
    </div>
    <label>Discount (₹)<input type="number" min="0" step="1" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} /></label>

    <label>Reason (optional, recorded on the subscription)<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder={selectedPlan ? `e.g. Switching to "${selectedPlan.name}" lowers the annual fee` : 'Why is this changing?'} /></label>

    <p className="ad-help">Changing the plan updates the terms on file going forward — the store&apos;s current paid-through date ({store.paidThroughDate || 'current term'}) does not change, and nothing is charged now.</p>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-form-footer">
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save plan change'}</Button>
    </div>
  </div>;
}
