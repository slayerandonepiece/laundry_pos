'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { lockStoreAction, unlockStoreAction } from '../actions/stores.actions';
import type { StoreListItem } from '../types';

export default function LockStoreDialog({ store, mode, onDone, onCancel }: {
  store: StoreListItem;
  mode: 'lock' | 'unlock';
  onDone: (store: StoreListItem) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll();
    dialog.showModal(); cancelRef.current?.focus();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);

  function confirm() {
    setBusy(true);
    setError('');
    const action = mode === 'lock' ? lockStoreAction : unlockStoreAction;
    action(store.id)
      .then(result => {
        if (!result.ok || !result.store) { setError(result.error || 'Could not update this store. Try again.'); setBusy(false); return; }
        onDone(result.store);
      })
      .catch(() => { setError('Could not update this store. Try again.'); setBusy(false); });
  }

  return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>{mode === 'lock' ? `Lock ${store.name}?` : `Unlock ${store.name}?`}</h2>
    <p id={id + '-description'}>
      {mode === 'lock'
        ? 'The owner and every employee will immediately lose access to this store — they will not be able to sign in or use any screen until it is unlocked.'
        : 'The owner and every employee will regain access to this store immediately.'}
    </p>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-confirm-actions">
      <button ref={cancelRef} className="ad-button ad-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="ad-button" onClick={confirm} disabled={busy}>{busy ? 'Saving…' : mode === 'lock' ? 'Lock store' : 'Unlock store'}</button>
    </div>
  </dialog>;
}
