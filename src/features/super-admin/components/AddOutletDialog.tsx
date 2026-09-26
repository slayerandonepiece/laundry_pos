'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { createOutletAction } from '../actions/stores.actions';

const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

export default function AddOutletDialog({ storeId, onSaved }: {
  storeId: string;
  onSaved: () => void;
}) {
  const onCancel = useDialogClose();
  const [outletCode, setOutletCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    const code = outletCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) return setError('Use only letters and numbers, 4–20 characters, no spaces — e.g. BWHYDWFD01.');
    if (!displayName.trim()) return setError('Enter an outlet name so staff can tell this outlet apart.');
    setBusy(true);
    setError('');
    createOutletAction(storeId, { outletCode: code, displayName: displayName.trim(), address: address.trim() || undefined, phone: phone.trim() || undefined })
      .then(result => {
        if (!result.ok || !result.outlet) { setError(result.error || 'Could not create this outlet. Try again.'); setBusy(false); return; }
        onSaved();
      })
      .catch(() => { setError('Could not create this outlet. Try again.'); setBusy(false); });
  }

  return <div className="ad-form">
    <label>Outlet code<input value={outletCode} onChange={e => setOutletCode(e.target.value.toUpperCase())} placeholder="e.g. BWHYDWFD01" required /></label>
    <p className="ad-help">Globally unique and immutable once created, e.g. OBLRCHN01.</p>
    <label>Outlet name<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Blue Wave — Whitefield" required /></label>
    <label>Address (optional)<input value={address} onChange={e => setAddress(e.target.value)} /></label>
    <label>Phone (optional)<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create outlet'}</Button>
    </DialogFooter>
  </div>;
}
