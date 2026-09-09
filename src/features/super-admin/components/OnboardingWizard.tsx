'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { money } from '@/features/admin/admin.data';
import { lookupOwnerAction, onboardStoreAction } from '../actions/stores.actions';
import PlanPickerCards from './PlanPickerCards';
import PlanEditor from './PlanEditor';
import Dialog, { useDialogClose } from './Dialog';
import type { OnboardStoreInput, OwnerLookupResult, StoreListItem, SubscriptionPlanListItem } from '../types';

const STEPS = ['Store', 'Owner', 'Plan', 'Review'] as const;

interface Draft {
  storeName: string;
  address: string;
  phone: string;
  ownerMode: 'new' | 'existing';
  ownerName: string;
  ownerUsername: string;
  ownerPassword: string;
  existingUsername: string;
  existingOwner: OwnerLookupResult | null;
  subscriptionMode: 'plan' | 'custom';
  planId: string;
  chargeDepositAnyway: boolean;
  discountAmount: string;
  depositAmount: string;
  annualFeeAmount: string;
  markPaid: boolean;
  notes: string;
}

const blank: Draft = {
  storeName: '', address: '', phone: '',
  ownerMode: 'new', ownerName: '', ownerUsername: '', ownerPassword: '',
  existingUsername: '', existingOwner: null,
  subscriptionMode: 'custom', planId: '', chargeDepositAnyway: false, discountAmount: '0',
  depositAmount: '10000', annualFeeAmount: '5000', markPaid: true, notes: '',
};

export default function OnboardingWizard({ plans: initialPlans, onSaved }: { plans: SubscriptionPlanListItem[]; onSaved: (store: StoreListItem) => void }) {
  const onCancel = useDialogClose();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(blank);
  const [plans, setPlans] = useState(initialPlans);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);

  const change = (patch: Partial<Draft>) => { setDraft(prev => ({ ...prev, ...patch })); setError(''); };
  const selectedPlan = plans.find(p => p.id === draft.planId);

  function validateStep(): string | null {
    if (step === 0) {
      if (!draft.storeName.trim()) return 'Enter a store name.';
    }
    if (step === 1) {
      if (draft.ownerMode === 'new') {
        if (!draft.ownerName.trim() || !/^[a-z0-9._-]{3,40}$/.test(draft.ownerUsername)) return 'Enter a name and a username with 3–40 letters, numbers, dots, underscores or hyphens.';
        if (draft.ownerPassword.length < 8) return 'Use a temporary password with at least 8 characters.';
      } else if (!draft.existingOwner) {
        return 'Look up an existing owner by username first.';
      }
    }
    if (step === 2) {
      if (draft.subscriptionMode === 'plan') {
        if (!draft.planId) return 'Choose a plan.';
      } else {
        if (!Number.isFinite(Number(draft.depositAmount)) || Number(draft.depositAmount) < 0) return 'Enter a valid deposit amount.';
        if (!Number.isFinite(Number(draft.annualFeeAmount)) || Number(draft.annualFeeAmount) < 0) return 'Enter a valid annual fee.';
      }
    }
    return null;
  }

  function next() {
    const message = validateStep();
    if (message) return setError(message);
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setError(''); setStep(s => Math.max(s - 1, 0)); }
  function jump(index: number) { setError(''); setStep(index); }

  function lookupOwner() {
    if (!draft.existingUsername.trim()) return;
    setLookupBusy(true);
    setError('');
    lookupOwnerAction(draft.existingUsername)
      .then(result => {
        if (!result) { setError('No account found with that username.'); change({ existingOwner: null }); return; }
        change({ existingOwner: result });
      })
      .finally(() => setLookupBusy(false));
  }

  function selectPlan(planId: string) {
    change({ planId, chargeDepositAnyway: false });
  }

  function submit() {
    const owner: OnboardStoreInput['owner'] = draft.ownerMode === 'new'
      ? { mode: 'new', name: draft.ownerName.trim(), username: draft.ownerUsername, password: draft.ownerPassword }
      : { mode: 'existing', userId: draft.existingOwner!.id };

    const subscription: OnboardStoreInput['subscription'] = draft.subscriptionMode === 'plan'
      ? { mode: 'plan', planId: draft.planId, discountAmount: Math.round(Number(draft.discountAmount) * 100), chargeDepositAnyway: draft.chargeDepositAnyway }
      : { mode: 'custom', depositAmount: Math.round(Number(draft.depositAmount) * 100), annualFeeAmount: Math.round(Number(draft.annualFeeAmount) * 100) };

    setBusy(true);
    onboardStoreAction({
      storeName: draft.storeName.trim(),
      address: draft.address.trim(),
      phone: draft.phone.trim(),
      owner,
      subscription,
      markPaid: draft.markPaid,
      notes: draft.notes.trim() || undefined,
    })
      .then(result => {
        if (!result.ok || !result.store) { setError(result.error || 'Could not onboard this store. Try again.'); setBusy(false); return; }
        onSaved(result.store);
      })
      .catch(() => { setError('Could not onboard this store. Try again.'); setBusy(false); });
  }

  const discountPaise = Math.round((Number(draft.discountAmount) || 0) * 100);
  const planDepositPaise = selectedPlan ? (selectedPlan.depositWaivedByDefault && !draft.chargeDepositAnyway ? 0 : selectedPlan.depositAmount) : 0;
  const depositPaise = draft.subscriptionMode === 'plan' ? Math.max(planDepositPaise - discountPaise, 0) : Math.round((Number(draft.depositAmount) || 0) * 100);
  const annualPaise = draft.subscriptionMode === 'plan' ? (selectedPlan?.annualFeeAmount ?? 0) : Math.round((Number(draft.annualFeeAmount) || 0) * 100);
  const totalDuePaise = draft.markPaid ? depositPaise + annualPaise : 0;

  return <div className="ad-form">
    <p className="muted" aria-live="polite">Step {step + 1} of {STEPS.length} — {step === 3 ? 'check everything before it is created.' : STEPS[step]}</p>
    <div className="steps" role="list" aria-label="Onboarding steps">
      {STEPS.map((label, index) => <span key={label} role="listitem" className={'step' + (index === step ? ' on' : index < step ? ' done' : '')}>{label}</span>)}
    </div>

    {step === 0 && <>
      <h3>Store details</h3>
      <label>Store name<input value={draft.storeName} onChange={e => change({ storeName: e.target.value })} placeholder="e.g. Sunrise Laundromat" required /></label>
      <label>Address<textarea value={draft.address} onChange={e => change({ address: e.target.value })} placeholder="Optional" /></label>
      <label>Phone<input value={draft.phone} onChange={e => change({ phone: e.target.value })} placeholder="Optional" /></label>
    </>}

    {step === 1 && <>
      <h3>Owner</h3>
      <div className="ad-form-grid">
        <label className="ad-checkbox"><input type="radio" name="ownerMode" checked={draft.ownerMode === 'new'} onChange={() => change({ ownerMode: 'new' })} />New owner</label>
        <label className="ad-checkbox"><input type="radio" name="ownerMode" checked={draft.ownerMode === 'existing'} onChange={() => change({ ownerMode: 'existing' })} />Existing owner (multi-store)</label>
      </div>
      {draft.ownerMode === 'new' ? <>
        <label>Owner name<input value={draft.ownerName} onChange={e => change({ ownerName: e.target.value })} required /></label>
        <label>Username<input value={draft.ownerUsername} onChange={e => change({ ownerUsername: e.target.value.toLowerCase() })} placeholder="letters, numbers, dots, underscores, hyphens" required /></label>
        <label>Temporary password<input type="text" value={draft.ownerPassword} onChange={e => change({ ownerPassword: e.target.value })} placeholder="At least 8 characters" required /></label>
      </> : <>
        <label>Owner&apos;s username<div className="ad-form-grid"><input value={draft.existingUsername} onChange={e => change({ existingUsername: e.target.value, existingOwner: null })} placeholder="Search by username" /><Button type="button" secondary onClick={lookupOwner} disabled={lookupBusy}>{lookupBusy ? 'Looking up…' : 'Look up'}</Button></div></label>
        {draft.existingOwner && <p className="ad-help">Found <strong>{draft.existingOwner.name}</strong> ({draft.existingOwner.username}) — already owns {draft.existingOwner.storeCount} store{draft.existingOwner.storeCount === 1 ? '' : 's'}.</p>}
      </>}
    </>}

    {step === 2 && <>
      <h3>Subscription terms</h3>
      {draft.ownerMode === 'existing' && draft.existingOwner && draft.existingOwner.storeCount > 0 && (
        <p className="ad-help">
          {draft.storeName || 'This store'} is owner {draft.existingOwner.name}&apos;s {draft.existingOwner.storeCount === 1 ? '2nd' : `${draft.existingOwner.storeCount + 1}th`} store —
          a no-deposit or multi-store plan may be the right one, if one exists.
        </p>
      )}
      <div className="ad-form-grid">
        <label className="ad-checkbox"><input type="radio" name="subscriptionMode" checked={draft.subscriptionMode === 'plan'} onChange={() => change({ subscriptionMode: 'plan' })} disabled={!plans.length} />Use a plan{!plans.length && ' (none available)'}</label>
        <label className="ad-checkbox"><input type="radio" name="subscriptionMode" checked={draft.subscriptionMode === 'custom'} onChange={() => change({ subscriptionMode: 'custom' })} />Custom terms</label>
      </div>
      {draft.subscriptionMode === 'plan' ? <>
        {plans.length > 0 && <PlanPickerCards plans={plans} value={draft.planId} onChange={selectPlan} />}
        <button type="button" className="ad-order-link" onClick={() => setCreatingPlan(true)}>+ Create a new plan</button>

        {selectedPlan?.depositWaivedByDefault && (
          <label className="ad-checkbox">
            <input type="checkbox" checked={draft.chargeDepositAnyway} onChange={e => change({ chargeDepositAnyway: e.target.checked })} />
            Charge a deposit anyway ({money(selectedPlan.depositAmount)}) — this plan waives it by default
          </label>
        )}

        <label>Discount, optional (₹)<input type="number" min="0" step="1" value={draft.discountAmount} onChange={e => change({ discountAmount: e.target.value })} /></label>

        {selectedPlan && (
          <div className="card-body" style={{ background: 'var(--brand-soft)', borderRadius: 10, padding: 12 }}>
            <div className="kv"><span>Plan fee</span><strong className="num">{money(annualPaise + (selectedPlan.depositWaivedByDefault && !draft.chargeDepositAnyway ? 0 : selectedPlan.depositAmount))}</strong></div>
            {discountPaise > 0 && <div className="kv"><span>Manual discount</span><strong className="num">− {money(discountPaise)}</strong></div>}
            <div className="kv total"><span>To collect today</span><strong className="num">{money(totalDuePaise)}</strong></div>
          </div>
        )}
      </> : <div className="ad-form-grid">
        <label>Deposit (₹)<input type="number" min="0" step="1" value={draft.depositAmount} onChange={e => change({ depositAmount: e.target.value })} /></label>
        <label>Annual maintenance (₹)<input type="number" min="0" step="1" value={draft.annualFeeAmount} onChange={e => change({ annualFeeAmount: e.target.value })} /></label>
      </div>}
      <label>Notes (optional)<textarea value={draft.notes} onChange={e => change({ notes: e.target.value })} placeholder="e.g. 2nd store, bundled with Store #1" /></label>
      {totalDuePaise === 0 ? (
        <p className="ad-help">Nothing due today — {depositPaise === 0 && annualPaise === 0 ? 'no deposit or fee on file yet' : 'mark received once payment comes in, from the store\'s Subscription tab'}.</p>
      ) : (
        <label className="ad-checkbox"><input type="checkbox" checked={draft.markPaid} onChange={e => change({ markPaid: e.target.checked })} />Deposit and first year received today</label>
      )}
    </>}

    {step === 3 && <>
      <h3>Review</h3>
      <ul className="ad-review-list">
        <li><span>Store</span><b>{draft.storeName || '—'} <button type="button" className="ad-order-link" onClick={() => jump(0)}>Edit</button></b></li>
        <li><span>Owner</span><b>{draft.ownerMode === 'new' ? `${draft.ownerName} (new, @${draft.ownerUsername})` : `${draft.existingOwner?.name} (@${draft.existingOwner?.username})`} <button type="button" className="ad-order-link" onClick={() => jump(1)}>Edit</button></b></li>
        <li><span>Plan</span><b>{draft.subscriptionMode === 'plan' ? selectedPlan?.name ?? '—' : 'Custom terms'} <button type="button" className="ad-order-link" onClick={() => jump(2)}>Edit</button></b></li>
        <li><span>Deposit</span><b>{money(depositPaise)}</b></li>
        <li><span>Annual fee</span><b>{money(annualPaise)}</b></li>
        <li><span>Payment</span><b>{draft.markPaid && totalDuePaise > 0 ? 'Marked received today' : 'Not yet received'}</b></li>
      </ul>

      {draft.ownerMode === 'existing' && draft.existingOwner && (
        <p className="ad-help">Signs in with their existing account — no new password needed.</p>
      )}

      <div className="ad-access-note">
        <strong>What happens when you confirm</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>{draft.storeName || 'The store'} is created and goes live immediately</li>
          <li>{draft.ownerMode === 'new' ? `A new account is created for ${draft.ownerName || 'the owner'}` : `The store is linked to ${draft.existingOwner?.name ?? 'the existing owner'}`}</li>
          {draft.markPaid && totalDuePaise > 0 && <li>One invoice is generated for {money(totalDuePaise)}</li>}
        </ul>
      </div>
    </>}

    {error && <p className="ad-error" role="alert">{error}</p>}

    <div className="ad-form-footer">
      <div className="ad-row">
        {step > 0 && <Button secondary type="button" onClick={back}>Back</Button>}
        <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      </div>
      {step < STEPS.length - 1
        ? <Button type="button" onClick={next}>Continue →</Button>
        : <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Onboarding…' : 'Onboard store ↗'}</Button>}
    </div>

    {creatingPlan && (
      <Dialog title="Create plan" description="Add reusable terms without leaving onboarding." onClose={() => setCreatingPlan(false)} warnOnChanges>
        <PlanEditor onSaved={plan => { setPlans(prev => [...prev, plan]); setCreatingPlan(false); selectPlan(plan.id); }} />
      </Dialog>
    )}
  </div>;
}
