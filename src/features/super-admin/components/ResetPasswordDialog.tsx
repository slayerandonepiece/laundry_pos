'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { lockBodyScroll } from '@/features/admin/admin.dialog';
import { resetUserPasswordAction } from '../actions/users.actions';

export default function ResetPasswordDialog({ userId, userName, onDone, onCancel }: {
  userId: string;
  userName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement, unlock = lockBodyScroll();
    dialog.showModal(); cancelRef.current?.focus();
    return () => { dialog.close(); unlock(); if (previous?.isConnected) previous.focus(); };
  }, []);

  function submit() {
    if (mode === 'manual' && password.length < 8) return setError('Use a password with at least 8 characters.');
    setBusy(true);
    setError('');
    resetUserPasswordAction(userId, mode === 'auto' ? { mode: 'auto' } : { mode: 'manual', password })
      .then(result => {
        if (!result.ok) { setError(result.error || 'Could not reset this password. Try again.'); setBusy(false); return; }
        setBusy(false);
        if (result.password) setGenerated(result.password);
        else onDone();
      })
      .catch(() => { setError('Could not reset this password. Try again.'); setBusy(false); });
  }

  if (generated) {
    return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); onDone(); }}>
      <h2 id={id}>New password for {userName}</h2>
      <p>Share this with them now — it will not be shown again.</p>
      <p className="ad-help"><strong>{generated}</strong></p>
      <div className="ad-confirm-actions">
        <button className="ad-button" onClick={onDone}>Done</button>
      </div>
    </dialog>;
  }

  return <dialog ref={ref} className="ad-root ad-confirm-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={id}>Reset password for {userName}</h2>
    <p>This immediately signs them out everywhere.</p>
    <div className="ad-form-grid">
      <label className="ad-checkbox"><input type="radio" name="mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />Generate automatically</label>
      <label className="ad-checkbox"><input type="radio" name="mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />Set manually</label>
    </div>
    {mode === 'manual' && <label>New password<input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-confirm-actions">
      <button ref={cancelRef} className="ad-button ad-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="ad-button" onClick={submit} disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
    </div>
  </dialog>;
}
