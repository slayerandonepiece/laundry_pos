'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { recordSubscriptionPaymentAction, paymentContextAction } from '../actions/stores.actions';
import { money, dateLabelFull } from '@/features/admin/admin.data';
import { discountedPaise, planPriceLabel } from '../utils';
import type { PaymentContext } from '@/server/services/stores';
import type { PaymentMethod, StoreInvoice, SubscriptionPlanListItem } from '../types';

// Platform subscription billing is intentionally fixed and independent of
// each store's customer-order payment methods.
const PAYMENT_METHODS = [{ value: 'UPI', label: 'UPI' }, { value: 'CASH', label: 'Cash' }] as const;

type Context = PaymentContext & { plans: SubscriptionPlanListItem[] };

const STATE_LABEL = { active: 'Active', ending: 'Due soon', trial: 'Trial', blocked: 'Blocked', awaiting: 'Not paid yet' } as const;

// The one place a payment is recorded: the organization's setup deposit while it is unpaid, and any
// outlets being paid or renewed. Each group is the same pattern: a plan, a discount percentage, a note.
export default function RecordPaymentDialog({ storeId, initialOutletIds, onSaved }: {
  storeId: string;
  // Outlets to tick first, e.g. from a row's own Renew action. Otherwise every outlet that is due.
  initialOutletIds?: string[];
  onSaved: (invoices: StoreInvoice[]) => void;
}) {
  const onCancel = useDialogClose();
  const [context, setContext] = useState<Context | null>(null);
  const [withDeposit, setWithDeposit] = useState(false);
  const [depositPlanId, setDepositPlanId] = useState('');
  const [depositDiscount, setDepositDiscount] = useState('0');
  const [depositNote, setDepositNote] = useState('');
  const [picked, setPicked] = useState<string[]>(initialOutletIds ?? []);
  const [outletPlanId, setOutletPlanId] = useState('');
  const [outletDiscount, setOutletDiscount] = useState('0');
  const [outletNote, setOutletNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    paymentContextAction(storeId).then(next => {
      if (!active) return;
      setContext(next);
      setWithDeposit(!next.deposit.paid);
      setDepositPlanId(next.deposit.planId ?? '');
      const chosen = initialOutletIds ?? next.outlets.filter(row => row.blocked || row.state === 'ending' || row.state === 'awaiting').map(row => row.id);
      setPicked(chosen);
      const plansOfChosen = new Set(next.outlets.filter(row => chosen.includes(row.id)).map(row => row.planId ?? ''));
      if (plansOfChosen.size === 1) setOutletPlanId([...plansOfChosen][0]);
    }).catch(() => { if (active) setError('Could not load this organization. Close and try again.'); });
    return () => { active = false; };
  }, [storeId, initialOutletIds]);

  if (!context) return <div className="ad-form"><p className="ad-help">{error || 'Loading…'}</p></div>;

  const depositPlans = context.plans.filter(plan => plan.kind === 'ONE_TIME');
  const outletPlans = context.plans.filter(plan => plan.kind === 'RECURRING');
  const depositPlan = depositPlans.find(plan => plan.id === depositPlanId);
  const sharedPlans = new Set(context.outlets.filter(row => picked.includes(row.id)).map(row => row.planId ?? ''));
  const shownOutletPlanId = outletPlanId || (sharedPlans.size === 1 ? [...sharedPlans][0] : '');
  const chosenOutletPlan = outletPlans.find(plan => plan.id === shownOutletPlanId);
  const rows = context.outlets;
  const priceOf = (row: (typeof rows)[number]) => (chosenOutletPlan ?? outletPlans.find(plan => plan.id === row.planId))?.amount ?? 0;
  const depositPercent = Math.min(Math.max(Number(depositDiscount) || 0, 0), 100);
  const outletPercent = Math.min(Math.max(Number(outletDiscount) || 0, 0), 100);
  const depositDue = withDeposit && depositPlan ? discountedPaise(depositPlan.amount, depositPercent) : 0;
  const outletsDue = rows.filter(row => picked.includes(row.id)).reduce((sum, row) => sum + discountedPaise(priceOf(row), outletPercent), 0);

  function toggle(id: string) {
    setPicked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }
  const allPicked = rows.length > 0 && picked.length === rows.length;

  function submit() {
    if (!withDeposit && !picked.length) return setError('Choose the deposit or at least one outlet.');
    if (withDeposit && !depositPlan) return setError('Choose the deposit plan.');
    if (picked.length && !chosenOutletPlan && rows.some(row => picked.includes(row.id) && !row.planId)) return setError('Choose a plan for the outlets.');
    for (const value of [depositDiscount, outletDiscount]) if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) return setError('Enter a discount between 0 and 100.');
    setBusy(true);
    setError('');
    recordSubscriptionPaymentAction(storeId, {
      deposit: withDeposit ? { planId: depositPlan!.id, discountPercent: depositPercent, note: depositNote.trim() || undefined } : undefined,
      outlets: picked.length ? { outletIds: picked, planId: chosenOutletPlan?.id, discountPercent: outletPercent, note: outletNote.trim() || undefined } : undefined,
      method, reference: reference.trim() || undefined,
    })
      .then(result => {
        if (!result.ok || !result.invoice) { setError(result.error || 'Could not record this payment. Try again.'); setBusy(false); return; }
        onSaved(result.invoices ?? [result.invoice]);
      })
      .catch(() => { setError('Could not record this payment. Try again.'); setBusy(false); });
  }

  const fields = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 } as const;
  const box = { border: '1px solid #edf0f4', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 } as const;
  const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as const;
  const planSelect = (list: SubscriptionPlanListItem[], value: string, onChange: (id: string) => void) =>
    <label style={{ gridColumn: '1 / -1' }}>Plan<select value={value} onChange={e => onChange(e.target.value)}>
      {!value && <option value="">Choose a plan</option>}
      {list.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {planPriceLabel(plan)}</option>)}
    </select></label>;

  return <div className="ad-form">
    <section style={box}>
      <div style={head}>
        <h3 style={{ margin: 0 }}>Setup deposit</h3>
        {context.deposit.paid
          ? <span className="ad-help" style={{ padding: 0 }}>Paid{context.deposit.paidAt ? ` on ${dateLabelFull(context.deposit.paidAt)}` : ''}{context.deposit.paidAmount !== undefined ? ` · ${money(context.deposit.paidAmount)}` : ''}{context.deposit.discountPercent ? ` · ${context.deposit.discountPercent}% off` : ''}</span>
          : <label className="ad-checkbox"><input type="checkbox" checked={withDeposit} onChange={e => setWithDeposit(e.target.checked)} />Collect now{withDeposit && depositPlan ? ` · ${money(depositDue)}` : ''}</label>}
      </div>
      {!context.deposit.paid && withDeposit && (depositPlans.length === 0
        ? <p className="ad-help">No one-time plan yet. Create one under Plans first.</p>
        : <div style={fields}>
          {planSelect(depositPlans, depositPlanId, setDepositPlanId)}
          <label>Discount (%)<input type="number" min={0} max={100} step={1} value={depositDiscount} onChange={e => setDepositDiscount(e.target.value)} /></label>
          <label>Note (optional)<input value={depositNote} onChange={e => setDepositNote(e.target.value)} placeholder="e.g. Referral" /></label>
        </div>)}
    </section>

    <section style={box}>
      <div style={head}>
        <h3 style={{ margin: 0 }}>Outlets</h3>
        {rows.length > 0 && <label className="ad-checkbox"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map(row => row.id))} />Select all · {picked.length} of {rows.length}</label>}
      </div>
      {rows.length === 0 ? <p className="ad-help">This organization has no outlets yet.</p> : <>
        <div style={{ border: '1px solid #edf0f4', borderRadius: 8 }}>
          {rows.map((row, index) => <label key={row.id} className="ad-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderTop: index ? '1px solid #edf0f4' : 0 }}>
            <input type="checkbox" checked={picked.includes(row.id)} onChange={() => toggle(row.id)} />
            <span style={{ flex: 1 }}>{row.name}<small style={{ display: 'block', color: 'var(--ad-muted)' }}>{STATE_LABEL[row.state]}{row.planName ? ` · ${row.planName}` : ''}{row.paidThroughDate ? ` · paid to ${dateLabelFull(row.paidThroughDate)}` : ''}</small></span>
            {picked.includes(row.id) && <strong>{money(discountedPaise(priceOf(row), outletPercent))}</strong>}
          </label>)}
        </div>
        {picked.length > 0 && (outletPlans.length === 0
          ? <p className="ad-help">No recurring plan yet. Create one under Plans first.</p>
          : <div style={fields}>
            {planSelect(outletPlans, shownOutletPlanId, setOutletPlanId)}
            <label>Discount (%)<input type="number" min={0} max={100} step={1} value={outletDiscount} onChange={e => setOutletDiscount(e.target.value)} /></label>
            <label>Note (optional)<input value={outletNote} onChange={e => setOutletNote(e.target.value)} placeholder="e.g. Referral" /></label>
          </div>)}
      </>}
    </section>

    <div className="ad-form-grid">
      <label>Method<select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Reference (optional)<input value={reference} onChange={e => setReference(e.target.value)} placeholder="UPI transaction ID, etc." /></label>
    </div>
    <div style={{ ...head, borderTop: '1px solid #edf0f4', paddingTop: 12 }}>
      <span className="ad-help" style={{ padding: 0 }}>{withDeposit && picked.length ? `Deposit ${money(depositDue)} + ${picked.length} outlet${picked.length === 1 ? '' : 's'} ${money(outletsDue)}. ` : ''}One invoice per line.</span>
      <strong style={{ fontSize: 18 }}>Total {money(depositDue + outletsDue)}</strong>
    </div>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</Button>
    </DialogFooter>
  </div>;
}
