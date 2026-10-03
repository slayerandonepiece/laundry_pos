'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { archiveStoreAction } from '../actions/stores.actions';
import Icon from './Icon';
import type { StoreListItem } from '../types';
import type { ArchiveEligibility } from '@/server/services/store-lifecycle';

// Archives an organization via Store.deletedAt (soft delete — order and
// payment history is kept, never hard-deleted). This is the one archive
// dialog for both the Organizations list (StoresScreenContainer, no known
// eligibility per row) and the Organization Edit screen's Danger zone
// (StoreEditFull, which checks eligibility up front) — eligibility is
// optional and, when omitted, the dialog just runs the normal
// type-to-confirm flow. When given and blocked, it shows why instead
// (active outlets / open orders still on the organization).
export default function DeleteStoreDialog({ store, eligibility, onDone, onCancel }: {
  store: StoreListItem;
  eligibility?: ArchiveEligibility;
  onDone: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blocked = eligibility ? !eligibility.canArchive : false;

  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll();
    dialog.showModal();
    (blocked ? cancelRef.current : inputRef.current)?.focus();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, [blocked]);

  function confirm() {
    setBusy(true);
    setError('');
    archiveStoreAction(store.id, confirmName)
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not archive this organization. Try again.'); setBusy(false); return; }
        onDone();
      })
      .catch(() => { setError('Could not archive this organization. Try again.'); setBusy(false); });
  }

  const matches = confirmName.trim() === store.name;

  if (blocked && eligibility) {
    const parts: string[] = [];
    if (eligibility.activeOutletCount > 0) parts.push(`${eligibility.activeOutletCount} active outlet${eligibility.activeOutletCount === 1 ? '' : 's'}`);
    if (eligibility.openOrderCount > 0) parts.push(`${eligibility.openOrderCount} open order${eligibility.openOrderCount === 1 ? '' : 's'}`);
    return <dialog ref={ref} className="dialog narrow" aria-labelledby={id} onCancel={event => { event.preventDefault(); onCancel(); }}>
      <div className="dialog-head"><h2 id={id}>Can&apos;t archive {store.name}</h2></div>
      <div className="dialog-body">
        <div className="notice danger">
          <Icon name="alertTriangle" size="s" />
          <span>It still has {parts.join(' and ')}. Close the outlet{eligibility.activeOutletCount === 1 ? '' : 's'} and complete or cancel the order{eligibility.openOrderCount === 1 ? '' : 's'} first.</span>
        </div>
      </div>
      <div className="dialog-foot">
        <button ref={cancelRef} className="ad-button" onClick={onCancel}>Close</button>
      </div>
    </dialog>;
  }

  return <dialog ref={ref} className="dialog narrow" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <div className="dialog-head"><h2 id={id}>Archive {store.name}?</h2></div>
    <div className="dialog-body">
      <p id={id + '-description'}>
        This removes it from the directory. Order and payment history is kept — never hard-deleted. There is currently no restore option; treat this as permanent.
      </p>
      <div className="field" style={{ marginTop: 14 }}>
        <label>Type <strong>{store.name}</strong> to confirm</label>
        <input ref={inputRef} value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off" />
      </div>
      {error && <p className="ad-error" role="alert">{error}</p>}
    </div>
    <div className="dialog-foot">
      <button ref={cancelRef} className="ad-button ad-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="ad-button" onClick={confirm} disabled={busy || !matches}>{busy ? 'Archiving…' : 'Archive organization'}</button>
    </div>
  </dialog>;
}
