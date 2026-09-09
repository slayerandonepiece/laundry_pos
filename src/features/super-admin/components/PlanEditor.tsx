'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose } from './Dialog';
import { createPlanAction, updatePlanAction } from '../actions/subscription-plans.actions';
import type { SubscriptionPlanListItem } from '../types';

export default function PlanEditor({ plan, onSaved }: { plan?: SubscriptionPlanListItem; onSaved: (plan: SubscriptionPlanListItem) => void }) {
  const onCancel = useDialogClose();
  const [name, setName] = useState(plan?.name ?? '');
  const [depositAmount, setDepositAmount] = useState(plan ? String(plan.depositAmount / 100) : '10000');
  const [annualFeeAmount, setAnnualFeeAmount] = useState(plan ? String(plan.annualFeeAmount / 100) : '5000');
  const [depositWaivedByDefault, setDepositWaivedByDefault] = useState(plan?.depositWaivedByDefault ?? false);
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!name.trim()) return setError('Enter a plan name.');
    if (!Number.isFinite(Number(depositAmount)) || Number(depositAmount) < 0) return setError('Enter a valid deposit amount.');
    if (!Number.isFinite(Number(annualFeeAmount)) || Number(annualFeeAmount) < 0) return setError('Enter a valid annual fee.');
    setBusy(true);
    setError('');
    const input = {
      name: name.trim(),
      depositAmount: Math.round(Number(depositAmount) * 100),
      annualFeeAmount: Math.round(Number(annualFeeAmount) * 100),
      depositWaivedByDefault,
      notes: notes.trim(),
    };
    const action = plan ? updatePlanAction(plan.id, input) : createPlanAction(input);
    action
      .then(result => {
        if (!result.ok || !result.plan) { setError(result.error || 'Could not save this plan. Try again.'); setBusy(false); return; }
        onSaved(result.plan);
      })
      .catch(() => { setError('Could not save this plan. Try again.'); setBusy(false); });
  }

  return <div className="ad-form">
    <label>Plan name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard annual" required /></label>
    <div className="ad-form-grid">
      <label>One-time deposit (₹)<input type="number" min="0" step="1" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></label>
      <label>Annual maintenance fee (₹)<input type="number" min="0" step="1" value={annualFeeAmount} onChange={e => setAnnualFeeAmount(e.target.value)} /></label>
    </div>
    <label>Billing cycle
      <select value="ANNUAL" disabled>
        <option value="ANNUAL">Yearly</option>
      </select>
    </label>
    <label className="ad-checkbox">
      <input type="checkbox" checked={depositWaivedByDefault} onChange={e => setDepositWaivedByDefault(e.target.checked)} />
      Deposit waived by default on this plan
    </label>
    <p className="ad-help">Stores onboarded with this plan skip the deposit unless overridden — the deposit amount above stays on file as the &quot;charge anyway&quot; figure.</p>
    <label>Notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What this plan is for — shown on the plan card, not to the owner" /></label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-form-footer">
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}</Button>
    </div>
  </div>;
}
