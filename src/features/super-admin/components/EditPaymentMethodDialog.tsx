'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { updatePlatformPaymentMethodAction } from '../actions/platform-payment-methods.actions';
import type { PlatformPaymentMethodDTO } from '@/server/services/platform-payment-methods';

export default function EditPaymentMethodDialog({
  method,
  onSaved,
}: {
  method: PlatformPaymentMethodDTO;
  onSaved: (method: PlatformPaymentMethodDTO) => void;
}) {
  const onCancel = useDialogClose();
  const [name, setName] = useState(method.name);
  const [active, setActive] = useState(method.active);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!name.trim()) return setError('Enter a display name.');
    setBusy(true);
    setError('');
    updatePlatformPaymentMethodAction(method.id, { name: name.trim(), active })
      .then(result => {
        if (!result.ok || !result.method) {
          setError(result.error || 'Could not update this payment method. Try again.');
          setBusy(false);
          return;
        }
        onSaved(result.method);
      })
      .catch(() => {
        setError('Could not update this payment method. Try again.');
        setBusy(false);
      });
  }

  return <div className="ad-form">
    <label>
      Code
      <input value={method.code} disabled />
    </label>
    <p className="ad-help">Code is immutable once created to preserve historical transaction integrity.</p>
    <label>
      Display name
      <input value={name} onChange={e => setName(e.target.value)} required />
    </label>
    <label className="ad-checkbox">
      <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
      Active — organizations can enable this payment method
    </label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
    </DialogFooter>
  </div>;
}
