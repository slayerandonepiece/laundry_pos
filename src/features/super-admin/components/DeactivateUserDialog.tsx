'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { deactivateUserAction, reactivateUserAction } from '../actions/users.actions';
import type { PlatformUserDetail } from '../types';

export default function DeactivateUserDialog({ user, onDone, onCancel }: {
  user: { id: string; name: string; active: boolean };
  onDone: (user: PlatformUserDetail) => void;
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
    const action = user.active ? deactivateUserAction : reactivateUserAction;
    action(user.id)
      .then(result => {
        if (!result.ok || !result.user) { setError(result.error || 'Could not update this user. Try again.'); setBusy(false); return; }
        onDone(result.user);
      })
      .catch(() => { setError('Could not update this user. Try again.'); setBusy(false); });
  }

  return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} aria-describedby={id + '-description'} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>{user.active ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}</h2>
    <p id={id + '-description'}>
      {user.active
        ? 'They will immediately lose access — signed out everywhere and unable to sign back in until reactivated.'
        : 'They will be able to sign in again with their existing username and password.'}
    </p>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-confirm-actions">
      <button ref={cancelRef} className="ad-button ad-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="ad-button" onClick={confirm} disabled={busy}>{busy ? 'Saving…' : user.active ? 'Deactivate' : 'Reactivate'}</button>
    </div>
  </dialog>;
}
