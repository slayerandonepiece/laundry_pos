'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { createPlatformPaymentMethodAction } from '../actions/platform-payment-methods.actions';
import type { PlatformPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import { PAYMENT_STAGE_LABELS, allowedPaymentStages, type PaymentStageValue } from '../utils';

const CODE_PATTERN = /^[A-Z0-9_]{2,30}$/;

export default function AddPaymentMethodDialog({ onSaved }: {
  onSaved: (method: PlatformPaymentMethodDTO) => void;
}) {
  const onCancel = useDialogClose();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [enabledByDefault, setEnabledByDefault] = useState(false);
  const [stage, setStage] = useState<PaymentStageValue>('BOTH');
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
    createPlatformPaymentMethodAction({ code: cleanCode, name: name.trim(), enabledByDefault, defaultStage: allowedPaymentStages(cleanCode).includes(stage) ? stage : 'PRE_ORDER' })
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
    <label>
      Appears at (default)
      <select value={allowedPaymentStages(code.trim().toUpperCase()).includes(stage) ? stage : 'PRE_ORDER'} onChange={e => setStage(e.target.value as PaymentStageValue)} disabled={allowedPaymentStages(code.trim().toUpperCase()).length === 1}>
        {allowedPaymentStages(code.trim().toUpperCase()).map(value => <option key={value} value={value}>{PAYMENT_STAGE_LABELS[value]}</option>)}
      </select>
    </label>
    <p className="ad-help">Pre-order: shown when an order is placed. Post-order: shown when collecting payment or delivering. Cash on delivery can only be pre-order.</p>
    <label className="ad-checkbox">
      <input type="checkbox" checked={enabledByDefault} onChange={e => setEnabledByDefault(e.target.checked)} />
      Enable for every new organization
    </label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add payment method'}</Button>
    </DialogFooter>
  </div>;
}
