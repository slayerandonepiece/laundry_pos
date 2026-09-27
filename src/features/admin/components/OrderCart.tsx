'use client';
import DateInput from './DateInput';
import { useState } from 'react';
import type { Line, StorePaymentMethod } from '../admin.types';
import type { SaleDraft } from '../pos.types';
import { money, today } from '../admin.data';
import { Button } from './Primitives';
import { isValidPhone } from '@/lib/contactValidation';

export default function OrderCart({ draft, lines, paymentMethods, error, busy, storageNote, onChange, onEdit, onRemove, onIncrement, onDecrement, onClear, onSubmit }: {
  draft: SaleDraft; lines: Line[]; error: string; busy: boolean;
  paymentMethods: StorePaymentMethod[];
  storageNote?: string;
  onChange: (patch: Partial<SaleDraft>) => void; onEdit: (id: string) => void; onRemove: (id: string) => void;
  onIncrement: (id: string) => void; onDecrement: (id: string) => void; onClear: () => void; onSubmit: () => void;
}) {
  const [customerError, setCustomerError] = useState('');
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  function continueOrder() {
    if (!isValidPhone(draft.phone)) { setCustomerError('Enter a valid customer phone number (8–15 digits).'); return; }
    setCustomerError(''); onChange({ customerReady: true });
  }
  return <form className={'ad-pos-cart ' + (draft.customerReady ? 'ad-cart-checkout' : 'ad-cart-customer')} onSubmit={e => { e.preventDefault(); if (draft.customerReady) onSubmit(); else continueOrder(); }}>
    <div className="ad-pos-cart-title"><h2>New sale</h2><button className="ad-text-link" type="button" onClick={onClear}>Clear</button></div>
    {!draft.customerReady ? <div className="ad-customer-step">
      <span className="ad-customer-step-icon" aria-hidden="true">○</span><h3>Enter customer details</h3><p>Add the customer to continue to the order review.</p>
      {lines.length > 0 && <div className="ad-selected-notice"><strong>{lines.length} selected services · {money(amount)}</strong><span>{lines.map(line => line.name + ' · ' + line.quantity + ' ' + line.unit).join(', ')}</span></div>}
      <label>Phone number<input type="tel" required value={draft.phone} onChange={e => { setCustomerError(''); onChange({ phone: e.target.value }); }} placeholder="Customer mobile"/></label>
      {storageNote && <p className="ad-help" role="alert" style={{ marginTop: 4, color: 'var(--ad-warning)' }}>{storageNote}</p>}
      <label>Customer name<input value={draft.name} onChange={e => onChange({ name: e.target.value })} placeholder="Optional"/></label>
      {customerError && <p className="ad-error" role="alert" aria-live="polite">{customerError}</p>}
    </div> : <div className="ad-pos-cart-content">
      <div className="ad-customer-compact"><div><strong>{draft.name || 'Customer'}</strong><small>{draft.phone}</small></div><button type="button" onClick={() => onChange({ customerReady: false })}>Edit customer</button></div>
      <div className="ad-cart-items-heading"><h3>Items <small>({lines.length})</small></h3></div>
      {!lines.length && <p className="ad-order-empty">Choose a service on the left to add items.</p>}
      <div className="ad-cart-table-scroll" role="region" aria-label="Selected items" tabIndex={0}><table className="ad-items-table"><thead><tr><th>Service</th><th>Qty / kg</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{lines.map(line => <tr key={line.productId}><td>{line.name}</td><td>{line.unit === 'pcs' ? <div className="ad-cart-quantity-stepper" aria-label={line.name + ' quantity'}><button type="button" onClick={() => onDecrement(line.productId)} aria-label={'Remove one ' + line.name}>−</button><strong aria-live="polite">{line.quantity}</strong><button type="button" onClick={() => onIncrement(line.productId)} aria-label={'Add one ' + line.name}>＋</button></div> : <strong className="ad-cart-weight">{line.quantity} kg</strong>}</td><td>{money(line.amount)}</td><td><div className="ad-cart-table-actions">{line.unit === 'kg' && <button type="button" onClick={() => onEdit(line.productId)} aria-label={'Edit weight for ' + line.name}>Edit weight</button>}<button type="button" onClick={() => onRemove(line.productId)} aria-label={'Remove ' + line.name}>×</button></div></td></tr>)}</tbody></table></div>
      <div className="ad-cart-payment"><h3>Delivery & payment</h3><div className="ad-form-grid">
        <label>Expected delivery<DateInput type="date" required min={today()} value={draft.due} onChange={e => onChange({ due: e.target.value })}/></label>
        <label>Received now (₹)<input type="number" min="0" max={amount / 100} step=".01" required value={draft.received} onChange={e => onChange({ received: e.target.value })}/></label>
        <label>Payment method<select value={draft.method} onChange={e => onChange({ method: e.target.value })}>{paymentMethods.map(method => <option key={method.id} value={method.name}>{method.name}</option>)}</select></label>
        <label>Notes
          <textarea
            className="ad-input"
            rows={2}
            placeholder="Delivery notes, special instructions…"
            value={draft.notes}
            onChange={e => onChange({ notes: e.target.value })}
            style={{ resize: 'none' }}
          />
        </label>
      </div></div>
    </div>}
    <div className="ad-pos-cart-footer">{error && <p role="alert" aria-live="polite" className="ad-error">{error}</p>}<div><span>Order total</span><strong>{money(amount)}</strong></div><Button type="submit" disabled={busy || (Boolean(draft.customerReady) && !lines.length)}>{!draft.customerReady ? 'Continue →' : busy ? 'Saving…' : 'Punch order'}</Button></div>
  </form>;
}
