'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { createPlatformPaymentMethodAction } from '../actions/platform-payment-methods.actions';
import type { PlatformPaymentMethodDTO } from '@/server/services/platform-payment-methods';

const CODE_PATTERN = /^[A-Z0-9_]{2,30}$/;

export default function AddPaymentMethodDialog({ onSaved }: {
  onSaved: (method: PlatformPaymentMethodDTO) => void;
}) {
  const onCancel = useDialogClose();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!CODE_PATTERN.test(cleanCode)) {
      return setError('Code must be 2–30 characters, uppercase letters, numbers and underscores only (e.g. UPI, CARD).');
    }
    if (!name.trim()) {
      return setError('Enter a display name for this payment method.');
    }
    setBusy(true);
    setError('');
    createPlatformPaymentMethodAction({ code: cleanCode, name: name.trim() })
      .then(result => {
        if (!result.ok || !result.method) {
          setError(result.error || 'Could not add this payment method. Try again.');
          setBusy(false);
          return;
        }
        onSaved(result.method);
      })
      .catch(() => {
        setError('Could not add this payment method. Try again.');
        setBusy(false);
      });
  }

  return <div className="ad-form">
    <label>
      Code
      <input
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. UPI, CARD, NET_BANKING"
        required
      />
    </label>
    <p className="ad-help">Permanent uppercase identifier once created — used in checkout and reporting.</p>
    <label>
      Display name
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. UPI / QR Code, Card (POS)"
        required
      />
    </label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add payment method'}</Button>
    </DialogFooter>
  </div>;
}
