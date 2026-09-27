'use client';
import { isValidPhone } from '@/lib/contactValidation';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { createUserAction } from '../actions/users.actions';
import type { PlatformRole, PlatformUserListItem } from '../types';

export default function UserAddDialog({ stores, onSaved }: {
  stores: { id: string; name: string }[];
  onSaved: (user: PlatformUserListItem) => void;
}) {
  const onCancel = useDialogClose();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeId, setStoreId] = useState('');
  const [role, setRole] = useState<PlatformRole>('EMPLOYEE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!name.trim() || !isValidPhone(phone)) return setError('Enter a name and a valid phone number (8–15 digits).');
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    setBusy(true);
    setError('');
    createUserAction({
      name: name.trim(),
      password,
      phone: phone.trim(),
      email: email.trim() || undefined,
      storeId: storeId || undefined,
      role: storeId ? role : undefined,
    })
      .then(result => {
        if (!result.ok || !result.user) { setError(result.error || 'Could not add this user. Try again.'); setBusy(false); return; }
        onSaved(result.user);
      })
      .catch(() => { setError('Could not add this user. Try again.'); setBusy(false); });
  }

  return <div className="ad-form">
    <label>Name<input value={name} onChange={e => setName(e.target.value)} required /></label>
    <div className="ad-form-grid">
      <label>Phone number<input type="tel" inputMode="numeric" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="10-digit mobile number" /></label>
      <label>Email (optional)<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>
    </div>
    <label>Temporary password<input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required /></label>
    <label>Organization (optional)
      <select value={storeId} onChange={e => setStoreId(e.target.value)}>
        <option value="">No organization — assign later</option>
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </label>
    {storeId && <label>Role<select value={role} onChange={e => setRole(e.target.value as PlatformRole)}>
      <option value="EMPLOYEE">Employee</option>
      <option value="OWNER">Owner</option>
    </select></label>}
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add user'}</Button>
    </DialogFooter>
  </div>;
}
