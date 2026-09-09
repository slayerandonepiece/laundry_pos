'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/features/admin/components/Primitives';
import { updateStoreAction } from '../actions/stores.actions';
import LockStoreDialog from './LockStoreDialog';
import DeleteStoreDialog from './DeleteStoreDialog';
import type { StoreDetail } from '../types';

export default function StoreEditFull({ store }: { store: StoreDetail }) {
  const router = useRouter();
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [email, setEmail] = useState(store.email);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  function submit() {
    if (!name.trim()) return setError('Enter a store name.');
    setBusy(true);
    setError('');
    updateStoreAction(store.id, { name: name.trim(), address: address.trim(), phone: phone.trim(), email: email.trim() })
      .then(result => {
        setBusy(false);
        if (!result.ok) { setError(result.error || 'Could not save changes. Try again.'); return; }
        setNotice('Changes saved');
        router.refresh();
        setTimeout(() => setNotice(''), 4000);
      })
      .catch(() => { setBusy(false); setError('Could not save changes. Try again.'); });
  }

  return <div className="ad-form">
    {notice && <div className="ad-toast" role="status">✓ {notice}</div>}
    <h3>Store details</h3>
    <label>Store name<input value={name} onChange={e => setName(e.target.value)} required /></label>
    <label>Address<textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Optional" /></label>
    <div className="ad-form-grid">
      <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" /></label>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Optional" /></label>
    </div>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>

    <div className="ad-danger-zone">
      <h3>Danger zone</h3>
      <div className="ad-danger-row">
        <div><strong>{store.status === 'LOCKED' ? 'Unlock this store' : 'Lock this store'}</strong><p>{store.status === 'LOCKED' ? 'Restore access for the owner and every employee.' : 'Immediately blocks the owner and every employee from signing in or using any screen.'}</p></div>
        <Button secondary type="button" onClick={() => setLockDialogOpen(true)}>{store.status === 'LOCKED' ? 'Unlock store' : 'Lock store'}</Button>
      </div>
      <div className="ad-danger-row">
        <div><strong>Delete this store</strong><p>Archives the store and removes it from the directory. Order and payment history is kept.</p></div>
        <Button secondary type="button" onClick={() => setDeleteDialogOpen(true)}>Delete store</Button>
      </div>
    </div>

    {lockDialogOpen && (
      <LockStoreDialog
        store={store}
        mode={store.status === 'LOCKED' ? 'unlock' : 'lock'}
        onCancel={() => setLockDialogOpen(false)}
        onDone={() => { setLockDialogOpen(false); setNotice(store.status === 'LOCKED' ? 'Store unlocked' : 'Store locked'); router.refresh(); setTimeout(() => setNotice(''), 4000); }}
      />
    )}
    {deleteDialogOpen && (
      <DeleteStoreDialog
        store={store}
        onCancel={() => setDeleteDialogOpen(false)}
        onDone={() => router.push('/super-admin/stores')}
      />
    )}
  </div>;
}
