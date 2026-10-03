'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/features/admin/components/Primitives';
import { isValidPhone, isValidNewPassword } from '@/lib/contactValidation';
import { dateLabelFull, money, today } from '@/features/admin/admin.data';
import { lookupOwnerByPhoneAction, onboardStoreAction } from '../actions/stores.actions';
import PlanPickerCards from './PlanPickerCards';
import PlanEditor from './PlanEditor';
import Dialog, { useDialogClose, DialogFooter } from './Dialog';
import Icon from './Icon';
import type { OnboardStoreInput, OwnerLookupResult, StoreListItem, SubscriptionPlanListItem } from '../types';

const STEPS = ['Organization', 'Owner', 'Plan', 'Review'] as const;

interface Draft {
  storeName: string;
  address: string;
  phone: string;
  ownerMode: 'new' | 'existing';
  ownerName: string;
  ownerPassword: string;
  ownerPhone: string;
  existingPhone: string;
  existingOwner: OwnerLookupResult | null;
  subscriptionMode: 'plan' | 'trial' | 'custom';
  trialStartDate: string;
  trialEndDate: string;
  depositAmount: string;
  annualFeeAmount: string;
  notes: string;
  markPaid: boolean;
  paymentMethod: 'UPI' | 'CASH';
  paymentReference: string;
  planId: string;
  discountAmount: string;
}

const blank: Draft = {
  storeName: '', address: '', phone: '',
  ownerMode: 'new', ownerName: '', ownerPassword: '', ownerPhone: '',
  existingPhone: '', existingOwner: null,
  subscriptionMode: 'plan', trialStartDate: '', trialEndDate: '', depositAmount: '10000', annualFeeAmount: '5000', notes: '', markPaid: false, paymentMethod: 'UPI', paymentReference: '',
  planId: '', discountAmount: '0',
};

export default function OnboardingWizard({ plans: initialPlans, onSaved }: { plans: SubscriptionPlanListItem[]; onSaved: (store: StoreListItem) => void }) {
  const onCancel = useDialogClose();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(blank);
  const [plans, setPlans] = useState(initialPlans);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [error, setError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [createdStore, setCreatedStore] = useState<StoreListItem | null>(null);

  const change = (patch: Partial<Draft>) => { setDraft(prev => ({ ...prev, ...patch })); setError(''); };
  const selectedPlan = plans.find(p => p.id === draft.planId);

  function validateStep(): string | null {
    if (step === 0) {
      if (!draft.storeName.trim()) return 'Enter an organization name.';
      if (draft.phone.trim() && !isValidPhone(draft.phone)) return 'Enter a valid phone number (8–15 digits).';
      if (!draft.phone.trim()) return 'Enter a contact phone number for this organization.';
    }
    if (step === 1) {
      if (draft.ownerMode === 'new') {
        if (draft.ownerName.trim().length < 2 || draft.ownerName.trim().length > 100) return 'Enter an owner name with 2–100 characters.';
        if (!isValidNewPassword(draft.ownerPassword)) return 'Use at least 8 characters with a letter and a number.';
        if (draft.ownerPhone.trim() && !isValidPhone(draft.ownerPhone)) return 'Enter a valid owner phone number (8–15 digits).';
        if (!draft.ownerPhone.trim()) return "Enter the owner's phone number.";
      } else if (!draft.existingOwner) {
        return 'Look up an existing owner by phone number first.';
      }
    }
    if (step === 2) {
      if (draft.subscriptionMode === 'plan' && !draft.planId) return 'Choose a plan.';
      if (draft.subscriptionMode === 'trial' && (!draft.trialEndDate || draft.trialEndDate <= today())) return 'Choose a trial end date after today.';
      if (draft.subscriptionMode === 'trial' && draft.trialStartDate && draft.trialStartDate >= draft.trialEndDate) return 'Trial start date must be before the end date.';
      if (draft.subscriptionMode === 'custom' && [draft.depositAmount, draft.annualFeeAmount].some(value => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0)) return 'Enter valid deposit and annual fee amounts.';
      if (!Number.isFinite(Number(draft.discountAmount)) || Number(draft.discountAmount) < 0) return 'Enter a valid discount amount.';
    }
    return null;
  }

  function next() {
    const message = validateStep();
    if (message) return setError(message);
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setError(''); setLookupError(''); setStep(s => Math.max(s - 1, 0)); }
  function jump(index: number) { setError(''); setLookupError(''); setStep(index); }

  function lookupOwner() {
    const query = draft.existingPhone.trim();
    if (!query) return;
    setLookupBusy(true);
    setLookupError('');
    setError('');

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLookupBusy(false);
      setLookupError('Search timed out after 30 seconds. Please try again.');
    }, 30000);

    lookupOwnerByPhoneAction(query)
      .then(result => {
        if (timedOut) return;
        clearTimeout(timeoutId);
        if (!result) {
          setLookupError('No customer account found with that phone number.');
          change({ existingOwner: null });
          return;
        }
        change({ existingOwner: result });
      })
      .catch(() => {
        if (timedOut) return;
        clearTimeout(timeoutId);
        setLookupError('Search failed. Please check your connection and try again.');
      })
      .finally(() => {
        if (!timedOut) {
          clearTimeout(timeoutId);
          setLookupBusy(false);
        }
      });
  }

  function selectPlan(planId: string) {
    change({ planId });
  }

  function submit() {
    const owner: OnboardStoreInput['owner'] = draft.ownerMode === 'new'
      ? { mode: 'new', name: draft.ownerName.trim(), password: draft.ownerPassword.trim(), ownerPhone: draft.ownerPhone.trim() }
      : { mode: 'existing', userId: draft.existingOwner!.id };

    if (busy) return;
    const subscription: OnboardStoreInput['subscription'] = draft.subscriptionMode === 'trial'
      ? { mode: 'trial', trialStartDate: draft.trialStartDate || undefined, trialEndDate: draft.trialEndDate }
      : draft.subscriptionMode === 'custom'
      ? { mode: 'custom', depositAmount: Math.round(Number(draft.depositAmount) * 100), annualFeeAmount: Math.round(Number(draft.annualFeeAmount) * 100) }
      : { mode: 'plan', planId: draft.planId, discountAmount: Math.round(Number(draft.discountAmount) * 100) };

    setBusy(true);
    onboardStoreAction({
      storeName: draft.storeName.trim(),
      address: draft.address.trim(),
      phone: draft.phone.trim(),
      owner,
      subscription,
      markPaid: recordPayment,
      paymentMethod: recordPayment ? draft.paymentMethod : undefined,
      paymentReference: recordPayment ? draft.paymentReference.trim() || undefined : undefined,
      notes: draft.notes.trim() || undefined,
    })
      .then(result => {
        if (!result.ok || !result.store) { setError(result.error || 'Could not onboard this organization. Try again.'); setBusy(false); return; }
        setCreatedStore(result.store);
        setBusy(false);
        onSaved(result.store);
      })
      .catch(() => { setError('Could not onboard this organization. Try again.'); setBusy(false); });
  }

  const discountPaise = draft.subscriptionMode === 'plan' ? Math.round((Number(draft.discountAmount) || 0) * 100) : 0;
  const depositPaise = draft.subscriptionMode === 'custom' ? Math.round(Number(draft.depositAmount) * 100) : draft.subscriptionMode === 'plan' && selectedPlan ? (selectedPlan.depositWaivedByDefault ? 0 : selectedPlan.depositAmount) : 0;
  const annualPaise = draft.subscriptionMode === 'custom' ? Math.round(Number(draft.annualFeeAmount) * 100) : draft.subscriptionMode === 'plan' ? selectedPlan?.annualFeeAmount ?? 0 : 0;
  const amountDuePaise = Math.max(depositPaise + annualPaise - discountPaise, 0);
  const recordPayment = draft.subscriptionMode !== 'trial' && amountDuePaise > 0 && draft.markPaid;
  const dateAfterDays = (days: number) => new Date(new Date(today() + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10);

  if (createdStore) {
    const invoiceSummary = draft.subscriptionMode === 'trial' ? `Free trial until ${dateLabelFull(draft.trialEndDate)}. No payment or invoice created.` : recordPayment ? 'Payment recorded and invoices generated. View them on the Subscription tab.' : 'No payment was marked received. Record it later from the Subscription tab.';

    return <div className="empty" style={{ padding: '28px 12px 12px' }}>
      <span className="ic l" style={{ color: 'var(--good-fg)' }}><Icon name="check" size="l" /></span>
      <h3>{createdStore.name} is live</h3>
      <p>{draft.ownerMode === 'new'
        ? `${draft.ownerName} can sign in now with the temporary password you set.`
        : `${createdStore.ownerName} can use their existing account now.`}</p>
      <div className="card" style={{ margin: '18px auto', maxWidth: 480, textAlign: 'left' }}>
        <div className="card-body">
          <div className="kv"><span>Organization</span><strong>{createdStore.name}</strong></div>
          <div className="kv"><span>Owner login</span><strong>{createdStore.ownerPhone}</strong></div>
          <div className="kv"><span>Paid through</span><strong>{createdStore.paidThroughDate ? dateLabelFull(createdStore.paidThroughDate) : 'Not paid yet'}</strong></div>
          <div className="kv"><span>Outlets</span><strong>{createdStore.outletCount > 0 ? `${createdStore.outletCount} outlet${createdStore.outletCount > 1 ? 's' : ''}` : 'No outlets yet — add the first one from the Outlets tab.'}</strong></div>
        </div>
      </div>
      <div className="notice warn" style={{ maxWidth: 480, margin: '0 auto 18px', textAlign: 'left' }}>
        <Icon name="store" size="s" />
        <span>{invoiceSummary} Create the first outlet before the owner can take orders.</span>
      </div>
      <div className="ad-row" style={{ justifyContent: 'center' }}>
        <Link className="btn" href={`/super-admin/stores/${createdStore.id}/outlets?add=1`}>Add first outlet</Link>
        <Link className="btn outline" href={`/super-admin/stores/${createdStore.id}`}>View organization</Link>
      </div>
    </div>;
  }

  return <div className="ad-form" aria-busy={busy}>
    <p className="muted" aria-live="polite">Step {step + 1} of {STEPS.length} — {step === 3 ? 'check everything before it is created.' : STEPS[step]}</p>
    <div className="steps" role="list" aria-label="Onboarding steps">
      {STEPS.map((label, index) => <span key={label} role="listitem" className={'step' + (index === step ? ' on' : index < step ? ' done' : '')}>{label}</span>)}
    </div>

    {step === 0 && <>
      <h3>Organization details</h3>
      <p className="ad-help">This becomes the organization&apos;s name across the platform and on invoices.</p>
      <label>Organization name<input value={draft.storeName} onChange={e => change({ storeName: e.target.value })} placeholder="e.g. Sunrise Laundromat" required /></label>
      <label>Address (optional)<textarea value={draft.address} onChange={e => change({ address: e.target.value })} placeholder="Street, city and postcode" /></label>
      <label>Phone *<input type="tel" required value={draft.phone} onChange={e => change({ phone: e.target.value })} placeholder="Contact number" /></label>
    </>}

    {step === 1 && <>
      <h3>Owner / Customer</h3>
      <p className="ad-help">Every organization needs one primary owner to start. Co-owners can be added later from Users.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0 16px' }}>
        <button
          type="button"
          onClick={() => change({ ownerMode: 'new' })}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: draft.ownerMode === 'new' ? '1.5px solid var(--brand)' : '1px solid var(--line-2)',
            background: draft.ownerMode === 'new' ? 'var(--brand-soft)' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: draft.ownerMode === 'new' ? '0 0 0 1px var(--brand) inset' : 'none',
            transition: 'all .15s ease',
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: draft.ownerMode === 'new' ? '5px solid var(--brand)' : '1.5px solid var(--line)', background: '#fff', marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>New organization owner</strong>
            <small style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Create a fresh owner account</small>
          </div>
        </button>

        <button
          type="button"
          onClick={() => change({ ownerMode: 'existing' })}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: draft.ownerMode === 'existing' ? '1.5px solid var(--brand)' : '1px solid var(--line-2)',
            background: draft.ownerMode === 'existing' ? 'var(--brand-soft)' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: draft.ownerMode === 'existing' ? '0 0 0 1px var(--brand) inset' : 'none',
            transition: 'all .15s ease',
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: draft.ownerMode === 'existing' ? '5px solid var(--brand)' : '1.5px solid var(--line)', background: '#fff', marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>Existing customer</strong>
            <small style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Multi-organization / recurring owner</small>
          </div>
        </button>
      </div>

      {draft.ownerMode === 'new' ? <>
        <label>Owner name<input value={draft.ownerName} onChange={e => change({ ownerName: e.target.value })} placeholder="Full name" required /></label>
        <label>Temporary password<input type="password" value={draft.ownerPassword} onChange={e => change({ ownerPassword: e.target.value })} placeholder="At least 8 characters" required /></label>
        <label>Owner login phone number *<input type="tel" inputMode="numeric" value={draft.ownerPhone} onChange={e => change({ ownerPhone: e.target.value })} placeholder="+91 98765 43210" required /></label>
      </> : <>
        <div className="field">
          <label htmlFor="customer-search-input">Search customer by phone number</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="customer-search-input"
              type="tel"
              inputMode="numeric"
              style={{ flex: 1 }}
              value={draft.existingPhone}
              onChange={e => {
                change({ existingPhone: e.target.value, existingOwner: null });
                setLookupError('');
              }}
              placeholder="Enter 10-digit phone number..."
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupOwner(); } }}
            />
            <Button
              type="button"
              secondary
              onClick={lookupOwner}
              disabled={lookupBusy || !draft.existingPhone.trim()}
              style={{ flexShrink: 0, minWidth: 140 }}
            >
              {lookupBusy ? 'Searching…' : 'Search customer'}
            </Button>
          </div>
          {lookupError && (
            <div className="ad-error" style={{ marginTop: 6, fontSize: 12.5 }} role="alert">
              {lookupError}
            </div>
          )}
        </div>
        {draft.existingOwner && (
          <div style={{ background: 'var(--brand-soft)', border: '1px solid #d8e5fb', borderRadius: 10, padding: '14px 16px', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand)', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              <Icon name="check" size="s" /> Verified Customer Account
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink)' }}>
              <strong>{draft.existingOwner.name}</strong>
              {draft.existingOwner.phone && <span style={{ marginLeft: 6, color: 'var(--ink-2)' }}>· 📞 {draft.existingOwner.phone}</span>}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Already owns {draft.existingOwner.storeCount} organization{draft.existingOwner.storeCount === 1 ? '' : 's'}{draft.existingOwner.storeNames?.length ? `: ${draft.existingOwner.storeNames.join(', ')}` : ''}.
            </p>
          </div>
        )}
      </>}
    </>}

    {step === 2 && <>
      <h3>Subscription terms</h3>
      {draft.ownerMode === 'existing' && draft.existingOwner && draft.existingOwner.storeCount > 0 && (
        <p className="ad-help">
          {draft.storeName || 'This organization'} is customer {draft.existingOwner.name}&apos;s {draft.existingOwner.storeCount === 1 ? '2nd' : `${draft.existingOwner.storeCount + 1}th`} organization —
          a no-deposit or multi-organization plan may be the right one, if one exists.
        </p>
      )}

      <fieldset className="subscription-mode">
        <legend>Subscription</legend>
        {([['plan', 'Use a plan', 'Select reusable pricing terms'], ['trial', 'Free trial', 'Set an end date, no payment'], ['custom', 'Custom terms', 'Enter deposit and annual fee']] as const).map(([mode, label, help]) => <label className="ad-checkbox" key={mode}>
          <input type="radio" name="subscription-mode" checked={draft.subscriptionMode === mode} onChange={() => change({ subscriptionMode: mode, markPaid: false, ...(mode === 'trial' && selectedPlan?.defaultTrialDays ? { trialEndDate: dateAfterDays(selectedPlan.defaultTrialDays) } : {}) })} />
          <span><strong>{label}</strong><small>{help}</small></span>
        </label>)}
      </fieldset>
      {draft.subscriptionMode === 'trial' && <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Trial starts (optional)<input type="date" value={draft.trialStartDate} onChange={e => change({ trialStartDate: e.target.value })} /><span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted, #64748b)' }}>Leave blank to start immediately.</span></label>
          <label>Trial end date<input type="date" min={dateAfterDays(1)} value={draft.trialEndDate} onChange={e => change({ trialEndDate: e.target.value })} /></label>
        </div>
        <div className="ad-row">{[7, 14, 30, 60, 90].map(days => <button type="button" className="btn outline sm" key={days} onClick={() => change({ trialEndDate: dateAfterDays(days) })}>{days} days</button>)}</div>
        <p className="ad-help">Nothing due today. No payment or invoice is created.</p>
      </>}
      {draft.subscriptionMode === 'custom' && <div className="ad-form-grid">
        <label>Deposit (₹)<input type="number" min="0" step="0.01" value={draft.depositAmount} onChange={e => change({ depositAmount: e.target.value })} /></label>
        <label>Annual maintenance fee (₹)<input type="number" min="0" step="0.01" value={draft.annualFeeAmount} onChange={e => change({ annualFeeAmount: e.target.value })} /></label>
      </div>}
      {draft.subscriptionMode === 'plan' && <>
      {plans.length > 0 && <PlanPickerCards plans={plans} value={draft.planId} onChange={selectPlan} />}
      <div style={{ margin: '6px 0 12px' }}>
        <button type="button" className="ad-order-link" onClick={() => setCreatingPlan(true)}>
          <Icon name="plus" size="s" /> Create a new template plan
        </button>
      </div>

      <label>Discount, optional (₹)<input type="number" min="0" step="0.01" value={draft.discountAmount} onChange={e => change({ discountAmount: e.target.value })} /></label>

      </>}
      {draft.subscriptionMode !== 'trial' && <label>Notes (optional)<textarea value={draft.notes} onChange={e => change({ notes: e.target.value })} /></label>}

      {draft.subscriptionMode !== 'trial' && (selectedPlan || draft.subscriptionMode === 'custom') && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--line-2)', borderRadius: 10, padding: '14px 16px', marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Deposit:</span>
              <strong className="num">{draft.subscriptionMode === 'plan' && selectedPlan?.depositWaivedByDefault ? '₹0 (Waived)' : money(depositPaise)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Annual maintenance (1st year):</span>
              <strong className="num">{money(annualPaise)}</strong>
            </div>
            {discountPaise > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                <span>Discount applied:</span>
                <strong className="num">− {money(discountPaise)}</strong>
              </div>
            )}
            <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
              <span>Total after discount:</span>
              <span className="badge good" style={{ fontSize: 13, padding: '4px 10px' }}>{money(amountDuePaise)}</span>
            </div>
          </div>
        </div>
      )}
      {draft.subscriptionMode !== 'trial' && amountDuePaise === 0 && <p className="ad-help">Nothing due today.</p>}
      {draft.subscriptionMode !== 'trial' && amountDuePaise > 0 && <>
        <label className="ad-checkbox"><input type="checkbox" checked={draft.markPaid} onChange={e => change({ markPaid: e.target.checked })} />Payment received — record it now and generate invoices</label>
        {draft.markPaid && <div className="ad-form-grid">
          <label>Payment method<select value={draft.paymentMethod} onChange={e => change({ paymentMethod: e.target.value as 'UPI' | 'CASH' })}><option value="UPI">UPI</option><option value="CASH">Cash</option></select></label>
          <label>Reference (optional)<input value={draft.paymentReference} onChange={e => change({ paymentReference: e.target.value })} placeholder="UPI transaction ID" /></label>
        </div>}
      </>}
    </>}

    {step === 3 && <>
      <h3>Review</h3>
      <ul className="ad-review-list">
        <li><span>Organization</span><b>{draft.storeName || '—'} <button type="button" className="ad-order-link" onClick={() => jump(0)} disabled={busy}>Edit</button></b></li>
        <li><span>Owner</span><b>{draft.ownerMode === 'new' ? `${draft.ownerName} (new, ${draft.ownerPhone})` : `${draft.existingOwner?.name} (${draft.existingOwner?.phone})`} <button type="button" className="ad-order-link" onClick={() => jump(1)} disabled={busy}>Edit</button></b></li>
        <li><span>Plan</span><b>{draft.subscriptionMode === 'trial' ? 'Free trial' : draft.subscriptionMode === 'custom' ? 'Custom terms' : selectedPlan?.name ?? '—'} <button type="button" className="ad-order-link" onClick={() => jump(2)} disabled={busy}>Edit</button></b></li>
        {draft.subscriptionMode === 'trial' ? <>
        <li><span>Trial starts</span><b>{draft.trialStartDate ? dateLabelFull(draft.trialStartDate) : 'Immediately'}</b></li>
        <li><span>Trial ends</span><b>{dateLabelFull(draft.trialEndDate)}</b></li>
        </> : <>
        <li><span>Deposit</span><b>{money(depositPaise)}</b></li>
        <li><span>Annual fee</span><b>{money(annualPaise)}</b></li>
        <li><span>Discount</span><b>{money(discountPaise)}</b></li>
        <li><span>Total after discount</span><b>{money(amountDuePaise)}</b></li>
        <li><span>Payment</span><b>{recordPayment ? `Recorded — ${draft.paymentMethod}` : 'Not yet received'}</b></li>
        </>}
      </ul>

      {draft.ownerMode === 'existing' && draft.existingOwner && (
        <p className="ad-help">Signs in with their existing account — no new password needed.</p>
      )}

      <div className="ad-access-note">
        <strong>What happens when you confirm</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>{draft.storeName || 'The organization'} is created and goes live immediately</li>
          <li>{draft.ownerMode === 'new' ? `A new account is created for ${draft.ownerName || 'the owner'}` : `The organization is linked to ${draft.existingOwner?.name ?? 'the existing owner'}`}</li>
          <li>{recordPayment ? 'Payment is recorded and invoices are generated' : 'No invoice is generated until a payment is recorded'}</li>
        </ul>
      </div>
    </>}

    {error && <p className="ad-error" role="alert">{error}</p>}

    <DialogFooter>
      <div className="ad-row" style={{ marginRight: 'auto' }}>
        {step > 0 && <Button secondary type="button" onClick={back} disabled={busy}>Back</Button>}
        <Button secondary type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
      {step < STEPS.length - 1
        ? <Button type="button" onClick={next}>Continue →</Button>
        : <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Creating organization…' : 'Onboard organization ↗'}</Button>}
    </DialogFooter>

    {creatingPlan && (
      <Dialog title="Create plan" description="Add reusable terms without leaving onboarding." onClose={() => setCreatingPlan(false)} warnOnChanges>
        <PlanEditor onSaved={plan => { setPlans(prev => [...prev, plan]); setCreatingPlan(false); selectPlan(plan.id); }} />
      </Dialog>
    )}
  </div>;
}
