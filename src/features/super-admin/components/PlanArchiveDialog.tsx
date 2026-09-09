'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { archivePlanAction, deletePlanAction, listPlanStoresAction } from '../actions/subscription-plans.actions';
import type { SubscriptionPlanListItem } from '../types';

export default function PlanArchiveDialog({ plan, otherPlans, onDone, onDeleted, onCancel }: {
  plan: SubscriptionPlanListItem;
  otherPlans: SubscriptionPlanListItem[];
  onDone: () => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [choice, setChoice] = useState<'detach' | string>('detach');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stores, setStores] = useState<{ id: string; name: string; ownerName: string }[] | null>(null);

  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll();
    dialog.showModal(); cancelRef.current?.focus();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (plan.storeCount > 0) listPlanStoresAction(plan.id).then(setStores);
  }, [plan.id, plan.storeCount]);

  function confirm() {
    setBusy(true);
    setError('');
    archivePlanAction(plan.id, choice === 'detach' ? undefined : choice)
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not archive this plan. Try again.'); setBusy(false); return; }
        onDone();
      })
      .catch(() => { setError('Could not archive this plan. Try again.'); setBusy(false); });
  }

  function confirmDelete() {
    setBusy(true);
    setError('');
    deletePlanAction(plan.id)
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not delete this plan. Try again.'); setBusy(false); return; }
        onDeleted();
      })
      .catch(() => { setError('Could not delete this plan. Try again.'); setBusy(false); });
  }

  return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>Archive {plan.name}?</h2>
    <p id={id + '-description'}>
      Archiving is safe and reversible — it only removes the plan from the &quot;select a plan&quot; list for new onboardings. Nothing changes for stores already using it.
    </p>
    {plan.storeCount > 0 && <>
      <p>Currently used by {plan.storeCount} store{plan.storeCount === 1 ? '' : 's'}:</p>
      {stores === null ? <p className="ad-help">Loading…</p> : (
        <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13 }}>
          {stores.map(s => <li key={s.id}>{s.name} — {s.ownerName}</li>)}
        </ul>
      )}
      <p>Choose what happens to them:</p>
      <div className="ad-form-grid">
        <label className="ad-checkbox"><input type="radio" name="choice" checked={choice === 'detach'} onChange={() => setChoice('detach')} />Leave as custom terms (detach)</label>
        {otherPlans.map(other => (
          <label key={other.id} className="ad-checkbox"><input type="radio" name="choice" checked={choice === other.id} onChange={() => setChoice(other.id)} />Move to {other.name}</label>
        ))}
      </div>
    </>}
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-confirm-actions" style={{ justifyContent: 'space-between' }}>
      {plan.storeCount === 0 ? (
        <button className="ad-order-link danger" onClick={confirmDelete} disabled={busy} title="Only possible once zero stores reference this plan">
          Delete plan instead
        </button>
      ) : (
        <span className="ad-help" style={{ margin: 0 }} title="Delete is only possible once zero stores reference this plan">
          Delete needs 0 stores attached (move the {plan.storeCount} above first)
        </span>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button ref={cancelRef} className="ad-button ad-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="ad-button" onClick={confirm} disabled={busy}>{busy ? 'Saving…' : 'Archive plan'}</button>
      </div>
    </div>
  </dialog>;
}
