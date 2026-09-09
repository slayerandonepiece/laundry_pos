'use client';
import { useState } from 'react';
import { Button } from '@/features/admin/components/Primitives';
import { useDialogClose } from './Dialog';
import { recordSubscriptionPaymentAction } from '../actions/stores.actions';
import type { PaymentMethod, StoreInvoice } from '../types';

// Platform subscription billing is intentionally fixed and independent of
// each store's customer-order payment methods.
const PAYMENT_METHODS = [{ value: 'UPI', label: 'UPI' }, { value: 'CASH', label: 'Cash' }] as const;

export default function RecordPaymentDialog({ storeId, storeName, onSaved }: {
  storeId: string;
  storeName: string;
  onSaved: (invoice: StoreInvoice) => void;
}) {
  const onCancel = useDialogClose();
  const [type, setType] = useState<'DEPOSIT' | 'RENEWAL'>('RENEWAL');
  const [amount, setAmount] = useState('5000');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit() {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return setError('Enter a valid amount.');
    setBusy(true);
    setError('');
    recordSubscriptionPaymentAction(storeId, { type, amount: Math.round(Number(amount) * 100), method, reference: reference.trim() || undefined, notes: notes.trim() || undefined })
      .then(result => {
        if (!result.ok || !result.invoice) { setError(result.error || 'Could not record this payment. Try again.'); setBusy(false); return; }
        onSaved(result.invoice);
      })
      .catch(() => { setError('Could not record this payment. Try again.'); setBusy(false); });
  }

  return <div className="ad-form">
    <p className="ad-help">Recording a payment for {storeName}.</p>
    <div className="ad-form-grid">
      <label className="ad-checkbox"><input type="radio" name="type" checked={type === 'RENEWAL'} onChange={() => setType('RENEWAL')} />Renewal — extends the paid-through date</label>
      <label className="ad-checkbox"><input type="radio" name="type" checked={type === 'DEPOSIT'} onChange={() => setType('DEPOSIT')} />Deposit</label>
    </div>
    <div className="ad-form-grid">
      <label>Amount (₹)<input type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>Method<select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <label>Reference (optional)<input value={reference} onChange={e => setReference(e.target.value)} placeholder="UPI transaction ID, etc." /></label>
    <label>Notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" /></label>
    {error && <p className="ad-error" role="alert">{error}</p>}
    <div className="ad-form-footer">
      <Button secondary type="button" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={submit} disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</Button>
    </div>
  </div>;
}
