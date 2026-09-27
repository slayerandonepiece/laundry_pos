'use client';
import DateInput from './DateInput';
import { findCustomerNameByPhoneAction } from '../actions/orders.actions';
import { useRef, useState } from 'react';
import type { Line, StorePaymentMethod } from '../admin.types';
import type { SaleDraft } from '../pos.types';
import { money, today } from '../admin.data';
import { Button } from './Primitives';
import { normalizePhone, isValidPhone } from '@/lib/contactValidation';

export default function OrderCart({ draft, lines, paymentMethods, error, busy, storageNote, onChange, onSubmit, onCustomerReady, showPayment }: {
  draft: SaleDraft; lines: Line[]; error: string; busy: boolean;
  paymentMethods: StorePaymentMethod[];
  storageNote?: string;
  onChange: (patch: Partial<SaleDraft>) => void; onSubmit: () => void; onCustomerReady?: () => void; showPayment: boolean;
}) {
  const request = useRef(0);
  const [lookup, setLookup] = useState('');
  async function searchCustomer() {
    const phone = normalizePhone(draft.phone), current = ++request.current;
    if (!isValidPhone(phone)) { setCustomerError('Enter a valid customer phone number (8–15 digits).'); return; }
    setCustomerError(''); setLookup('Searching…');
    try { const name = await findCustomerNameByPhoneAction(phone); if (current !== request.current) return; onChange({ phone, name: name ?? draft.name }); setLookup(name ? 'Existing customer found' : 'New customer · name is optional'); }
    catch { if (current === request.current) setLookup('Could not search customers. Try again.'); }
  }
  const [customerError, setCustomerError] = useState('');
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  function continueOrder() {
    if (!isValidPhone(draft.phone)) { setCustomerError('Enter a valid customer phone number (8–15 digits).'); return; }
    setCustomerError(''); onChange({ phone: normalizePhone(draft.phone), customerReady: true }); onCustomerReady?.();
  }
  return <form className={'ad-pos-cart ' + (showPayment ? 'ad-cart-checkout' : 'ad-cart-customer')} onSubmit={e => { e.preventDefault(); if (showPayment) onSubmit(); else continueOrder(); }}>
    <div className="ad-pos-cart-title"><h2>{showPayment ? 'Delivery & payment' : 'Customer'}</h2></div>
    {!showPayment ? <div className="ad-customer-step">
      <label>Phone number<input type="tel" required value={draft.phone} onChange={e => { request.current++; setLookup(''); setCustomerError(''); onChange({ phone: e.target.value, name: '' }); }} placeholder="Customer mobile"/></label><button type="button" className="ad-button ad-secondary" disabled={busy || lookup === 'Searching…'} onClick={() => void searchCustomer()}>Search customer</button>{lookup && <p role="status" className="ad-help">{lookup}</p>}
      {storageNote && <p className="ad-help" role="alert" style={{ marginTop: 4, color: 'var(--ad-warning)' }}>{storageNote}</p>}
      <label>Customer name<input value={draft.name} onChange={e => onChange({ name: e.target.value })} placeholder="Optional"/></label>
      {customerError && <p className="ad-error" role="alert" aria-live="polite">{customerError}</p>}
    </div> : <div className="ad-pos-cart-content">
      <div className="ad-customer-compact"><div><strong>{draft.name || 'Customer'}</strong><small>{draft.phone}</small></div><button type="button" onClick={() => onChange({ customerReady: false })}>Edit customer</button></div>
      <div className="ad-cart-payment"><div className="ad-form-grid">
        <label>Expected delivery<DateInput type="date" required min={today()} value={draft.due} onChange={e => onChange({ due: e.target.value })}/></label>
        <label>Received now (₹)<input type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required value={draft.received} onChange={e => onChange({ received: e.target.value })}/></label>
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
    <div className="ad-pos-cart-footer">{error && <p role="alert" aria-live="polite" className="ad-error">{error}</p>}{showPayment && lines.length > 0 && <div><span>Order total</span><strong>{money(amount)}</strong></div>}<Button type="submit" disabled={busy || (showPayment && !lines.length)}>{!showPayment ? 'Continue →' : busy ? 'Saving…' : 'Punch order'}</Button></div>
  </form>;
}
