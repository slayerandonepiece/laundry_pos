'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/features/admin/components/Primitives';
import { dateLabelFull, money } from '@/features/admin/admin.data';
import { lookupOwnerAction, onboardStoreAction } from '../actions/stores.actions';
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
  const [lookupError, setLookupError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [createdStore, setCreatedStore] = useState<StoreListItem | null>(null);

  const change = (patch: Partial<Draft>) => { setDraft(prev => ({ ...prev, ...patch })); setError(''); };
  const selectedPlan = plans.find(p => p.id === draft.planId);

  function validateStep(): string | null {
    if (step === 0) {
      if (!draft.storeName.trim()) return 'Enter an organization name.';
    }
    if (step === 1) {
      if (draft.ownerMode === 'new') {
        if (!draft.ownerName.trim() || !/^[a-z0-9._-]{3,40}$/.test(draft.ownerUsername)) return 'Enter a name and a username with 3–40 letters, numbers, dots, underscores or hyphens.';
        if (draft.ownerPassword.length < 8) return 'Use a temporary password with at least 8 characters.';
      } else if (!draft.existingOwner) {
        return 'Look up an existing owner by phone number or username first.';
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
  function back() { setError(''); setLookupError(''); setStep(s => Math.max(s - 1, 0)); }
  function jump(index: number) { setError(''); setLookupError(''); setStep(index); }

  function lookupOwner() {
    const query = draft.existingUsername.trim();
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

    lookupOwnerAction(query)
      .then(result => {
        if (timedOut) return;
        clearTimeout(timeoutId);
        if (!result) {
          setLookupError('No customer account found with that mobile number or username.');
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
        if (!result.ok || !result.store) { setError(result.error || 'Could not onboard this organization. Try again.'); setBusy(false); return; }
        setCreatedStore(result.store);
        setBusy(false);
        onSaved(result.store);
      })
      .catch(() => { setError('Could not onboard this organization. Try again.'); setBusy(false); });
  }

  const discountPaise = Math.round((Number(draft.discountAmount) || 0) * 100);
  const planDepositPaise = selectedPlan ? (selectedPlan.depositWaivedByDefault && !draft.chargeDepositAnyway ? 0 : selectedPlan.depositAmount) : 0;
  const depositPaise = draft.subscriptionMode === 'plan' ? Math.max(planDepositPaise - discountPaise, 0) : Math.round((Number(draft.depositAmount) || 0) * 100);
  const annualPaise = draft.subscriptionMode === 'plan' ? (selectedPlan?.annualFeeAmount ?? 0) : Math.round((Number(draft.annualFeeAmount) || 0) * 100);
  // Amount due is a pricing fact, not a payment-status fact. Keeping these
  // separate prevents unticking markPaid from hiding its own checkbox (S1).
  const amountDuePaise = depositPaise + annualPaise;

  if (createdStore) {
    const invoiceSummary = draft.markPaid && amountDuePaise > 0
      ? `Two invoices were generated: ${money(depositPaise)} deposit and ${money(annualPaise)} annual.`
      : 'No payment was marked received. Record it later from the Subscription tab.';

    return <div className="empty" style={{ padding: '28px 12px 12px' }}>
      <span className="ic l" style={{ color: 'var(--good-fg)' }}><Icon name="check" size="l" /></span>
      <h3>{createdStore.name} is live</h3>
      <p>{draft.ownerMode === 'new'
        ? `${draft.ownerName} can sign in now with the temporary password you set.`
        : `${createdStore.ownerName} can use their existing account now.`}</p>
      <div className="card" style={{ margin: '18px auto', maxWidth: 480, textAlign: 'left' }}>
        <div className="card-body">
          <div className="kv"><span>Organization</span><strong>{createdStore.name}</strong></div>
          <div className="kv"><span>Owner login</span><strong>@{createdStore.ownerUsername}</strong></div>
          <div className="kv"><span>Paid through</span><strong>{createdStore.paidThroughDate ? dateLabelFull(createdStore.paidThroughDate) : 'Not paid yet'}</strong></div>
          <div className="kv"><span>Outlets</span><strong>{createdStore.outletCount} — none yet</strong></div>
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

  return <div className="ad-form">
    <p className="muted" aria-live="polite">Step {step + 1} of {STEPS.length} — {step === 3 ? 'check everything before it is created.' : STEPS[step]}</p>
    <div className="steps" role="list" aria-label="Onboarding steps">
      {STEPS.map((label, index) => <span key={label} role="listitem" className={'step' + (index === step ? ' on' : index < step ? ' done' : '')}>{label}</span>)}
    </div>

    {step === 0 && <>
      <h3>Organization details</h3>
      <p className="ad-help">This becomes the organization&apos;s name across the platform and on invoices.</p>
      <label>Organization name<input value={draft.storeName} onChange={e => change({ storeName: e.target.value })} placeholder="e.g. Sunrise Laundromat" required /></label>
      <label>Address (optional)<textarea value={draft.address} onChange={e => change({ address: e.target.value })} placeholder="Street, city and postcode" /></label>
      <label>Phone (optional)<input value={draft.phone} onChange={e => change({ phone: e.target.value })} placeholder="Contact number" /></label>
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
        <label>Username<input value={draft.ownerUsername} onChange={e => change({ ownerUsername: e.target.value.toLowerCase() })} placeholder="letters, numbers, dots, underscores, hyphens" required /></label>
        <label>Temporary password<input type="text" value={draft.ownerPassword} onChange={e => change({ ownerPassword: e.target.value })} placeholder="At least 8 characters" required /></label>
      </> : <>
        <div className="field">
          <label htmlFor="customer-search-input">Search customer by phone or username</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="customer-search-input"
              style={{ flex: 1 }}
              value={draft.existingUsername}
              onChange={e => {
                change({ existingUsername: e.target.value, existingOwner: null });
                setLookupError('');
              }}
              placeholder="Enter 10-digit mobile number or username..."
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupOwner(); } }}
            />
            <Button
              type="button"
              secondary
              onClick={lookupOwner}
              disabled={lookupBusy || !draft.existingUsername.trim()}
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
              <strong>{draft.existingOwner.name}</strong> (@{draft.existingOwner.username})
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '8px 0 16px' }}>
        <button
          type="button"
          disabled={!plans.length}
          onClick={() => change({ subscriptionMode: 'plan' })}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: draft.subscriptionMode === 'plan' ? '1.5px solid var(--brand)' : '1px solid var(--line-2)',
            background: draft.subscriptionMode === 'plan' ? 'var(--brand-soft)' : '#fff',
            cursor: plans.length ? 'pointer' : 'not-allowed',
            textAlign: 'left',
            boxShadow: draft.subscriptionMode === 'plan' ? '0 0 0 1px var(--brand) inset' : 'none',
            transition: 'all .15s ease',
            opacity: plans.length ? 1 : 0.6,
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: draft.subscriptionMode === 'plan' ? '5px solid var(--brand)' : '1.5px solid var(--line)', background: '#fff', marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>Pre-configured plan</strong>
            <small style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Select reusable pricing template</small>
          </div>
        </button>

        <button
          type="button"
          onClick={() => change({ subscriptionMode: 'custom' })}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: draft.subscriptionMode === 'custom' ? '1.5px solid var(--brand)' : '1px solid var(--line-2)',
            background: draft.subscriptionMode === 'custom' ? 'var(--brand-soft)' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            boxShadow: draft.subscriptionMode === 'custom' ? '0 0 0 1px var(--brand) inset' : 'none',
            transition: 'all .15s ease',
          }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: draft.subscriptionMode === 'custom' ? '5px solid var(--brand)' : '1.5px solid var(--line)', background: '#fff', marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>Custom terms</strong>
            <small style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Define one-off deposit & fee</small>
          </div>
        </button>
      </div>

      {draft.subscriptionMode === 'plan' ? <>
        {plans.length > 0 && <PlanPickerCards plans={plans} value={draft.planId} onChange={selectPlan} />}
        <div style={{ margin: '6px 0 12px' }}>
          <button type="button" className="ad-order-link" onClick={() => setCreatingPlan(true)}>
            <Icon name="plus" size="s" /> Create a new template plan
          </button>
        </div>

        {selectedPlan?.depositWaivedByDefault && (
          <label className="ad-checkbox">
            <input type="checkbox" checked={draft.chargeDepositAnyway} onChange={e => change({ chargeDepositAnyway: e.target.checked })} />
            Charge a deposit anyway ({money(selectedPlan.depositAmount)}) — this plan waives it by default
          </label>
        )}

        <label>Discount, optional (₹)<input type="number" min="0" step="1" value={draft.discountAmount} onChange={e => change({ discountAmount: e.target.value })} /></label>

        {selectedPlan && (
          <div style={{ background: '#f8fafc', border: '1px solid var(--line-2)', borderRadius: 10, padding: '14px 16px', marginTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Deposit:</span>
                <strong className="num">{selectedPlan?.depositWaivedByDefault && !draft.chargeDepositAnyway ? '₹0 (Waived)' : money(depositPaise + discountPaise)}</strong>
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
                <span>Total due at onboarding:</span>
                <span className="badge good" style={{ fontSize: 13, padding: '4px 10px' }}>{money(amountDuePaise)}</span>
              </div>
            </div>
          </div>
        )}
      </> : <div className="ad-form-grid">
        <label>Deposit (₹)<input type="number" min="0" step="1" value={draft.depositAmount} onChange={e => change({ depositAmount: e.target.value })} /></label>
        <label>Annual maintenance (₹)<input type="number" min="0" step="1" value={draft.annualFeeAmount} onChange={e => change({ annualFeeAmount: e.target.value })} /></label>
      </div>}
      <label>Notes (optional)<textarea value={draft.notes} onChange={e => change({ notes: e.target.value })} placeholder="e.g. 2nd location, bundled with #1" /></label>
      {draft.subscriptionMode === 'custom' && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--line-2)', borderRadius: 10, padding: '14px 16px', marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
            <span>Total due at onboarding:</span>
            <span className="badge good" style={{ fontSize: 13, padding: '4px 10px' }}>{money(amountDuePaise)}</span>
          </div>
        </div>
      )}
      {amountDuePaise === 0 ? (
        <p className="ad-help">Nothing due today — no deposit or annual fee is on file yet.</p>
      ) : (
        <label className="ad-checkbox">
          <input type="checkbox" checked={draft.markPaid} onChange={e => change({ markPaid: e.target.checked })} />
          Deposit and first year received today — generates separate deposit and annual invoices. Untick if payment has not arrived yet; the amount due stays visible and this can be reticked before continuing.
        </label>
      )}
    </>}

    {step === 3 && <>
      <h3>Review</h3>
      <ul className="ad-review-list">
        <li><span>Organization</span><b>{draft.storeName || '—'} <button type="button" className="ad-order-link" onClick={() => jump(0)}>Edit</button></b></li>
        <li><span>Owner</span><b>{draft.ownerMode === 'new' ? `${draft.ownerName} (new, @${draft.ownerUsername})` : `${draft.existingOwner?.name} (@${draft.existingOwner?.username})`} <button type="button" className="ad-order-link" onClick={() => jump(1)}>Edit</button></b></li>
        <li><span>Plan</span><b>{draft.subscriptionMode === 'plan' ? selectedPlan?.name ?? '—' : 'Custom terms'} <button type="button" className="ad-order-link" onClick={() => jump(2)}>Edit</button></b></li>
        <li><span>Deposit</span><b>{money(depositPaise)}</b></li>
        <li><span>Annual fee</span><b>{money(annualPaise)}</b></li>
        <li><span>Payment</span><b>{draft.markPaid && amountDuePaise > 0 ? 'Marked received today' : 'Not yet received'}</b></li>
      </ul>

      {draft.ownerMode === 'existing' && draft.existingOwner && (
        <p className="ad-help">Signs in with their existing account — no new password needed.</p>
      )}

      <div className="ad-access-note">
        <strong>What happens when you confirm</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>{draft.storeName || 'The organization'} is created and goes live immediately</li>
          <li>{draft.ownerMode === 'new' ? `A new account is created for ${draft.ownerName || 'the owner'}` : `The organization is linked to ${draft.existingOwner?.name ?? 'the existing owner'}`}</li>
          {draft.markPaid && amountDuePaise > 0
            ? <li>Two invoices are generated — {money(depositPaise)} deposit and {money(annualPaise)} annual</li>
            : <li>No invoice is generated until a payment is recorded</li>}
        </ul>
      </div>
    </>}

    {error && <p className="ad-error" role="alert">{error}</p>}

    <DialogFooter>
      <div className="ad-row" style={{ marginRight: 'auto' }}>
        {step > 0 && <Button secondary type="button" onClick={back}>Back</Button>}
        <Button secondary type="button" onClick={onCancel}>Cancel</Button>
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
