'use client';
import { useState } from 'react';
import type { Order, PaymentMethodOption } from '../admin.types';
import { money, paid, total } from '../admin.data';
import { methodAllowsPhase } from '@/lib/paymentStage';
import { Button } from './Primitives';
import { Dialog } from './ui';

/**
 * Delivery needs the order paid in full. When a balance is due this collects it
 * (amount shown, payment method chosen) and delivers in one step; otherwise it
 * only asks for confirmation. Delivered is final.
 */
export default function DeliverOrderDialog({ order, paymentMethods, busy, onConfirm, onCancel }: {
  order: Order;
  paymentMethods: PaymentMethodOption[];
  busy: boolean;
  onConfirm: (method?: string) => void;
  onCancel: () => void;
}) {
  const balance = total(order) - paid(order);
  const methods = paymentMethods.filter(method => methodAllowsPhase(method, 'POST_ORDER'));
  const [method, setMethod] = useState(methods[0]?.name ?? '');
  const needsPayment = balance > 0;
  const blocked = needsPayment && !methods.length;

  return <Dialog title={needsPayment ? 'Collect payment and deliver' : 'Mark as delivered'} onClose={onCancel} foot={<>
    <Button secondary type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
    <Button type="button" disabled={busy || blocked || (needsPayment && !method)} onClick={() => onConfirm(needsPayment ? method : undefined)}>
      {busy ? 'Delivering…' : needsPayment ? `Collect ${money(balance)} and deliver` : 'Mark delivered'}
    </Button>
  </>}>
    {needsPayment ? <div className="ad-form">
      <p>{order.id} has {money(balance)} still due. Collect it to deliver this order.</p>
      <label>Payment method
        <select value={method} onChange={event => setMethod(event.target.value)} disabled={busy || blocked}>
          {methods.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
        </select>
      </label>
      {blocked
        ? <p className="ad-error" role="alert">No payment method is set up for collecting at delivery. Contact support.</p>
        : <p className="ad-help">Cash on delivery can&apos;t be recorded here. Pick the method the customer actually used, e.g. Cash.</p>}
    </div> : <p>Mark {order.id} as delivered?</p>}
    <p className="ad-help">Delivered orders are final and can&apos;t be changed.</p>
  </Dialog>;
}
