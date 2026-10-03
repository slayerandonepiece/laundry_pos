'use client';
import { useId, useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { createPlanAction, updatePlanAction } from '../actions/subscription-plans.actions';
import type { BillingCycle, PlanInput, SubscriptionPlanListItem } from '../types';

export default function PlanEditor({ plan, onSaved }: { plan?: SubscriptionPlanListItem; onSaved: (plan: SubscriptionPlanListItem) => void }) {
  const depositRadioName = useId();
  const cycleRadioName = useId();
  const [defaultTrialDays, setDefaultTrialDays] = useState(plan?.defaultTrialDays?.toString() ?? '');
  const onCancel = useDialogClose();
  const [name, setName] = useState(plan?.name ?? '');
  const [depositAmount, setDepositAmount] = useState(plan ? String(plan.depositAmount / 100) : '10000');
  const [annualFeeAmount, setAnnualFeeAmount] = useState(plan ? String(plan.annualFeeAmount / 100) : '5000');
  const [depositWaivedByDefault, setDepositWaivedByDefault] = useState(plan?.depositWaivedByDefault ?? false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(plan?.billingCycle ?? 'ANNUAL');
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!name.trim()) return setError('Enter a plan name.');
    if (!Number.isFinite(Number(depositAmount)) || Number(depositAmount) < 0) return setError('Enter a valid deposit amount.');
    if (!Number.isFinite(Number(annualFeeAmount)) || Number(annualFeeAmount) < 0) return setError('Enter a valid annual fee.');
    if (defaultTrialDays && (!Number.isSafeInteger(Number(defaultTrialDays)) || Number(defaultTrialDays) < 0)) return setError('Enter a whole number of trial days.');
    setBusy(true);
    setError('');
    const input: PlanInput = {
      name: name.trim(),
      depositAmount: depositWaivedByDefault ? 0 : Math.round(Number(depositAmount) * 100),
      defaultTrialDays: defaultTrialDays === '' ? null : Number(defaultTrialDays),
      annualFeeAmount: Math.round(Number(annualFeeAmount) * 100),
      depositWaivedByDefault,
      billingCycle,
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
    <fieldset className="subscription-mode">
      <legend>One-time deposit</legend>
      <label className="ad-checkbox"><input type="radio" name={depositRadioName} checked={!depositWaivedByDefault} onChange={() => setDepositWaivedByDefault(false)} />Charge a deposit</label>
      {!depositWaivedByDefault && <label>Amount (₹)<input type="number" min="0" step="0.01" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} /></label>}
      <label className="ad-checkbox"><input type="radio" name={depositRadioName} checked={depositWaivedByDefault} onChange={() => { setDepositWaivedByDefault(true); setDepositAmount('0'); }} />No deposit — organizations on this plan skip the deposit</label>
    </fieldset>
    <label>Annual maintenance fee (₹)<input type="number" min="0" step="0.01" value={annualFeeAmount} onChange={e => setAnnualFeeAmount(e.target.value)} /></label>
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ padding: 0, marginBottom: 8 }}>Billing cycle</legend>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          ['ANNUAL', 'Yearly', 'Renews every 12 months'],
          ['HALF_YEARLY', 'Half-yearly', 'Renews every 6 months'],
          ['QUARTERLY', 'Quarterly', 'Renews every 3 months'],
          ['MONTHLY', 'Monthly', 'Renews every month'],
        ].map(([value, label, description]) => <label key={value} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, padding: 12, border: `1px solid ${billingCycle === value ? 'var(--brand, #0758d6)' : 'var(--line, #dce2eb)'}`, borderRadius: 8, background: billingCycle === value ? 'var(--brand-soft, #eef3ff)' : '#fff', cursor: 'pointer' }}>
          <input type="radio" name={cycleRadioName} value={value} checked={billingCycle === value} onChange={() => setBillingCycle(value as BillingCycle)} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 }} />
          <strong>{label}</strong>
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted, #64748b)' }}>{description}</span>
        </label>)}
      </div>
    </fieldset>
    <label>Default trial period (optional)<input type="number" min="0" step="1" value={defaultTrialDays} onChange={e => setDefaultTrialDays(e.target.value)} placeholder="Days" /></label>
    <p className="ad-help">Leave blank for no default trial.</p>
    <label>Notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What this plan is for — shown on the plan card, not to the owner" /></label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}</Button>
    </DialogFooter>
  </div>;
}
