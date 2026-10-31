'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose, DialogFooter } from './Dialog';
import { updatePlatformPaymentMethodAction } from '../actions/platform-payment-methods.actions';
import type { PlatformPaymentMethodDTO } from '@/server/services/platform-payment-methods';
import { PAYMENT_STAGE_LABELS, allowedPaymentStages, type PaymentStageValue } from '../utils';

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
  const [enabledByDefault, setEnabledByDefault] = useState(method.enabledByDefault);
  const [stage, setStage] = useState<PaymentStageValue>(method.defaultStage);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!name.trim()) return setError('Enter a display name.');
    setBusy(true);
    setError('');
    updatePlatformPaymentMethodAction(method.id, { name: name.trim(), active, enabledByDefault, defaultStage: stage })
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
    <label>
      Appears at (default)
      <select value={stage} onChange={e => setStage(e.target.value as PaymentStageValue)} disabled={allowedPaymentStages(method.code).length === 1}>
        {allowedPaymentStages(method.code).map(value => <option key={value} value={value}>{PAYMENT_STAGE_LABELS[value]}</option>)}
      </select>
    </label>
    <p className="ad-help">Used for new organizations. Existing organizations keep their own setting.</p>
    <label className="ad-checkbox">
      <input type="checkbox" checked={enabledByDefault} onChange={e => setEnabledByDefault(e.target.checked)} />
      Enable for every new organization
    </label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
    </DialogFooter>
  </div>;
}
