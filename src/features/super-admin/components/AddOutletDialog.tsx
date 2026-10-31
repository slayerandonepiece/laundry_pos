'use client';
import { isValidPhone } from '@/lib/contactValidation';
import { useEffect, useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { createOutletAction, outletBillingContextAction } from '../actions/stores.actions';
import PlanPickerCards from './PlanPickerCards';
import PlanDiscountFields from './PlanDiscountFields';
import { discountedPaise } from '../utils';
import { dateLabelFull, money } from '@/features/admin/admin.data';
import type { SubscriptionPlanListItem } from '../types';

const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

export default function AddOutletDialog({ storeId, onSaved }: {
  storeId: string;
  onSaved: () => void;
}) {
  const onCancel = useDialogClose();
  const [outletCode, setOutletCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Each outlet is billed on its own recurring plan; during a free trial it costs nothing.
  const [plans, setPlans] = useState<SubscriptionPlanListItem[]>([]);
  const [trialEndsAt, setTrialEndsAt] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [planId, setPlanId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState<'UPI' | 'CASH'>('UPI');
  const [reference, setReference] = useState('');
  const plan = plans.find(item => item.id === planId);
  const percent = Math.min(Math.max(Number(discount) || 0, 0), 100);

  useEffect(() => {
    let active = true;
    outletBillingContextAction(storeId).then(context => { if (!active) return; setPlans(context.plans); setTrialEndsAt(context.trialEndsAt); setLoaded(true); }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [storeId]);

  function submit() {
    const code = outletCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) return setError('Use only letters and numbers, 4–20 characters, no spaces — e.g. BWHYDWFD01.');
    if (!displayName.trim()) return setError('Enter an outlet name so staff can tell this outlet apart.');
    if (!phone.trim()) return setError('Enter a contact phone number for this outlet.');
    if (!isValidPhone(phone)) return setError('Enter a valid phone number.');
    if (!trialEndsAt && !plan) return setError('Choose a plan for this outlet.');
    if (!Number.isFinite(Number(discount)) || Number(discount) < 0 || Number(discount) > 100) return setError('Enter a discount between 0 and 100.');
    setBusy(true);
    setError('');
    createOutletAction(storeId, {
      outletCode: code, displayName: displayName.trim(), address: address.trim() || undefined, phone: phone.trim(),
      billing: trialEndsAt ? undefined : { planId: plan!.id, discountPercent: percent, note: note.trim() || undefined, paymentReceived: paid, method, reference: reference.trim() || undefined },
    })
      .then(result => {
        if (!result.ok || !result.outlet) { setError(result.error || 'Could not create this outlet. Try again.'); setBusy(false); return; }
        onSaved();
      })
      .catch(() => { setError('Could not create this outlet. Try again.'); setBusy(false); });
  }

  return <div className="ad-form">
    <label>Outlet code<input value={outletCode} onChange={e => setOutletCode(e.target.value.toUpperCase())} placeholder="e.g. BWHYDWFD01" required /></label>
    <p className="ad-help">Globally unique and immutable once created, e.g. OBLRCHN01.</p>
    <label>Outlet name<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Blue Wave — Whitefield" required /></label>
    <label>Address (optional)<input value={address} onChange={e => setAddress(e.target.value)} /></label>
    <label>Phone *<input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} /></label>
    {loaded && trialEndsAt && <p className="ad-help">Free until {dateLabelFull(trialEndsAt)} while the organization is on its trial. Choose this outlet&apos;s plan when you record payment.</p>}
    {loaded && !trialEndsAt && <>
      {plans.length > 0 ? <PlanPickerCards plans={plans} value={planId} onChange={setPlanId} /> : <p className="ad-help">No recurring plan yet. Create one under Plans first.</p>}
      {plan && <PlanDiscountFields listAmount={plan.amount} discount={discount} note={note} onDiscount={setDiscount} onNote={setNote} />}
      {plan && <>
        <p className="ad-help">Amount due: {money(discountedPaise(plan.amount, percent))}</p>
        <label className="ad-checkbox"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />Payment received — record it now</label>
        {paid ? <div className="ad-form-grid">
          <label>Payment method<select value={method} onChange={e => setMethod(e.target.value as 'UPI' | 'CASH')}><option value="UPI">UPI</option><option value="CASH">Cash</option></select></label>
          <label>Reference (optional)<input value={reference} onChange={e => setReference(e.target.value)} placeholder="UPI transaction ID" /></label>
        </div> : <p className="ad-help">Not recorded yet: the outlet stays blocked until its first payment.</p>}
      </>}
    </>}
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create outlet'}</Button>
    </DialogFooter>
  </div>;
}
