'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { updateStoreAction } from '../actions/stores.actions';
import type { StoreListItem } from '../types';

export default function StoreEditDialog({ store, onSaved }: { store: StoreListItem; onSaved: (store: StoreListItem) => void }) {
  const onCancel = useDialogClose();
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [email, setEmail] = useState(store.email);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!name.trim()) return setError('Enter an organization name.');
    setBusy(true);
    setError('');
    updateStoreAction(store.id, { name: name.trim(), address: address.trim(), phone: phone.trim(), email: email.trim() })
      .then(result => {
        if (!result.ok || !result.store) { setError(result.error || 'Could not save changes. Try again.'); setBusy(false); return; }
        onSaved(result.store);
      })
      .catch(() => { setError('Could not save changes. Try again.'); setBusy(false); });
  }

  return <div className="ad-form">
    <label>Organization name<input value={name} onChange={e => setName(e.target.value)} required /></label>
    <label>Address<textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional" /></label>
    <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></label>
    <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" /></label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
    </DialogFooter>
  </div>;
}
