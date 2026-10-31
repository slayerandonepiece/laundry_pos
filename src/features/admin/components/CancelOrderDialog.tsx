'use client';
import { useState } from 'react';
import type { Order } from '../admin.types';
import { money, paid } from '../admin.data';
import { Button } from './Primitives';
import { Dialog } from './ui';

/** Owner-only: cancel an order that has not been delivered. A reason is required and is kept in the audit trail. */
export default function CancelOrderDialog({ order, onClose, onCancelOrder }: {
  order: Order;
  onClose: () => void;
  /** Resolves to an error message to show, or null when the order was cancelled. */
  onCancelOrder: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const collected = paid(order);

  async function submit() {
    if (reason.trim().length < 3) return setError('Enter a reason of at least 3 characters.');
    setBusy(true); setError('');
    try {
      const failure = await onCancelOrder(reason.trim());
      if (failure) setError(failure);
    } catch { setError('Could not cancel the order. Try again.'); }
    finally { setBusy(false); }
  }

  return <Dialog title="Cancel this order?" onClose={() => { if (!busy) onClose(); }} foot={<>
    <Button secondary type="button" disabled={busy} onClick={onClose}>Keep order</Button>
    <Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? 'Cancelling…' : 'Cancel order'}</Button>
  </>}>
    <div className="ad-form">
      <p>{order.id} will be removed from the order list and the daily totals. Cancelled orders can&apos;t be brought back.</p>
      {collected > 0 && <p className="ad-help" role="status">{money(collected)} has already been collected on this order. Cancelling does not refund it; settle that with the customer.</p>}
      <label>Reason<textarea value={reason} onChange={event => { setReason(event.target.value); setError(''); }} rows={3} maxLength={500} disabled={busy} placeholder="Why is this order being cancelled?" /></label>
      {error && <p className="ad-error" role="alert">{error}</p>}
    </div>
  </Dialog>;
}
