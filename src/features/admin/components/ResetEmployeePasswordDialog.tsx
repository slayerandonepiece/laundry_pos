'use client';
import { useState } from 'react';
import type { Employee } from '../admin.types';
import { Dialog } from './ui';

export default function ResetEmployeePasswordDialog({ employee, onClose, onSave }: { employee: Employee; onClose: () => void; onSave: (password: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [show, setShow] = useState(false);
  return <Dialog title="Reset employee password" onClose={() => { if (!busy) onClose(); }} warnOnChanges foot={<><button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="reset-employee-password" className="btn btn-primary" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button></>}>
    <p>Set a new temporary password for {employee.name}. Their current sessions will end. The new password replaces the old one.</p>
    <form id="reset-employee-password" className="ad-form" onSubmit={async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const password = String(data.get('password'));
      if (password !== String(data.get('confirm'))) return setError('Passwords must match.');
      setBusy(true); setError('');
      try { await onSave(password); } catch { setError('Could not reset this password. Try again.'); } finally { setBusy(false); }
    }}>
      <label>New temporary password<input name="password" type={show ? 'text' : 'password'} minLength={8} maxLength={128} autoComplete="new-password" required disabled={busy}/></label>
      <label>Confirm password<input name="confirm" type={show ? 'text' : 'password'} minLength={8} maxLength={128} autoComplete="new-password" required disabled={busy}/></label>
      <button type="button" className="ad-text-link" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide passwords' : 'Show passwords'}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </form>
  </Dialog>;
}
