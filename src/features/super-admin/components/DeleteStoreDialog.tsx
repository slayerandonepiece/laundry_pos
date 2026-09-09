'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { archiveStoreAction } from '../actions/stores.actions';
import type { StoreListItem } from '../types';

export default function DeleteStoreDialog({ store, onDone, onCancel }: {
  store: StoreListItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll();
    dialog.showModal(); inputRef.current?.focus();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);

  function confirm() {
    setBusy(true);
    setError('');
    archiveStoreAction(store.id, confirmName)
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not delete this store. Try again.'); setBusy(false); return; }
        onDone();
      })
      .catch(() => { setError('Could not delete this store. Try again.'); setBusy(false); });
  }

  const matches = confirmName.trim() === store.name;

  return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>Delete {store.name}?</h2>
    <p id={id + '-description'}>
      This archives the store — the owner and every employee immediately lose access, and it disappears from the directory.
      Order, payment and subscription history are kept, not destroyed.
    </p>
    <label>Type <strong>{store.name}</strong> to confirm<input ref={inputRef} value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off" /></label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-confirm-actions">
      <button className="ad-button ad-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="ad-button" onClick={confirm} disabled={busy || !matches}>{busy ? 'Deleting…' : 'Delete store'}</button>
    </div>
  </dialog>;
}
