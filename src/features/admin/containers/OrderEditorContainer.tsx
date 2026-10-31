'use client';
import DateInput from '../components/DateInput';
import QuantityInput from '../components/QuantityInput';
import Link from 'next/link';
import { findCustomerNameByPhoneAction } from '../actions/orders.actions';
import { isCashOnDelivery } from '../payment-methods';
import { useState, useRef } from 'react';
import type { Product, Line, PaymentMethodOption } from '../admin.types';
import { methodAllowsPhase } from '@/lib/paymentStage';
import { money, price, today } from '../admin.data';
import { Button, usePanelClose } from '../components/Primitives';
import { SingleSelectDropdown } from '../components/ui/Dropdown';
import type { CreateOrderInput } from '@/server/services/orders';
import type { OutletListItem } from '@/features/super-admin/types';

interface Entry { key: string; id: string; quantity: number }
const blankEntry = (): Entry => ({ key: crypto.randomUUID(), id: '', quantity: 1 });
// Calendar-day arithmetic on the IST `YYYY-MM-DD` string from today(); UTC keeps it DST/offset-free.
const addDays = (date: string, days: number) => { const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
// Keeps the 10-digit mobile number when a number is typed or pasted with a +91 / 0 prefix.
const tenDigitPhone = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits; };
export default function OrderEditorContainer({ products, paymentMethods: allPaymentMethods, outlets = [], onSave }: { products: Product[]; paymentMethods: PaymentMethodOption[]; outlets?: OutletListItem[]; onSave: (input: CreateOrderInput, outletId?: string) => Promise<void> }) {
  const onCancel = usePanelClose();
  // Only methods set to appear when an order is placed are offered here.
  const paymentMethods = allPaymentMethods.filter(method => methodAllowsPhase(method, 'PRE_ORDER'));
  const [entries, setEntries] = useState<Entry[]>([]), [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [outletId, setOutletId] = useState(''), [received, setReceived] = useState('0');
  const [paidInFull, setPaidInFull] = useState(false);
  const [phone, setPhone] = useState(''), [phoneError, setPhoneError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [lookupState, setLookupState] = useState<'idle' | 'searching' | 'found' | 'new' | 'error'>('idle');
  const lookupRequest = useRef(0);
  const [methodName, setMethodName] = useState(paymentMethods[0]?.name ?? '');
  const selectedMethod = paymentMethods.find(method => method.name === methodName) ?? paymentMethods[0];
  const cashOnDelivery = isCashOnDelivery(selectedMethod);
  async function searchCustomer() {
    const clean = tenDigitPhone(phone);
    if (!/^[0-9]{10}$/.test(clean)) { setPhoneError('Enter a valid 10-digit mobile number.'); return; }
    setPhone(clean); setPhoneError(''); setLookupState('searching');
    const request = ++lookupRequest.current;
    try {
      const name = await findCustomerNameByPhoneAction(clean);
      if (request !== lookupRequest.current) return;
      setCustomerName(name ?? '');
      setLookupState(name ? 'found' : 'new');
    } catch {
      if (request === lookupRequest.current) setLookupState('error');
    }
  }
  // One key per form mount; reused across resubmits of this draft so a
  // double-click or retry can't create two orders.
  const idempotencyKey = useRef(crypto.randomUUID());
  const submitted = useRef(false), available = products.filter(product => product.active);
  // Only owners of a multi-outlet store choose the outlet; everyone else keeps the server's selected/default outlet.
  const activeOutlets = outlets.filter(outlet => outlet.status === 'ACTIVE'), chooseOutlet = activeOutlets.length > 1;
  const lines: Line[] = entries.flatMap(entry => {
    const product = available.find(product => product.id === entry.id);
    return product ? [{ productId: product.id, name: product.name, quantity: entry.quantity, unit: product.type === 'weight' ? 'kg' : 'pcs', amount: price(product, entry.quantity) }] : [];
  });
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  const effectiveReceived = cashOnDelivery ? '0' : paidInFull ? (sum > 0 ? (sum / 100).toFixed(2) : '0') : received;
  const receivedCents = Math.round(Number(effectiveReceived) * 100), shownReceived = Number.isFinite(receivedCents) && receivedCents > 0 ? receivedCents : 0;

  return <form className="ad-form ad-order-form" onChangeCapture={() => setError('')} onSubmit={event => {
    event.preventDefault(); if (submitted.current) return;
    const data = new FormData(event.currentTarget), cleanPhone = tenDigitPhone(phone);
    if (chooseOutlet && !activeOutlets.some(outlet => outlet.id === outletId)) return setError('Choose an outlet for this order.');
    if (!cleanPhone) {
      setPhoneError('Phone number is required.');
      return;
    }
    if (!/^[0-9]{10}$/.test(cleanPhone)) {
      setPhoneError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!entries.length || entries.some(entry => !available.some(product => product.id === entry.id))) return setError('Add a service and choose a product for every row.');
    if (lines.some(line => line.quantity <= 0 || !Number.isFinite(line.quantity) || (line.unit === 'pcs' && !Number.isInteger(line.quantity)))) return setError('Enter a positive weight or whole-item quantity.');
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) return setError('Combine repeated services into one line.');
    if (receivedCents > 0 && !selectedMethod) return setError('Enable a payment method in Profile before recording a payment.');
    if (!Number.isFinite(receivedCents) || receivedCents > sum || receivedCents < 0) return setError('Payment must be between zero and the order total.');
    submitted.current = true;
    setSaving(true);
    onSave({
      idempotencyKey: idempotencyKey.current,
      customerName: String(data.get('name')).trim(),
      phone: cleanPhone,
      dueDate: String(data.get('due')),
      notes: String(data.get('notes')).trim(),
      entries: entries.map(entry => ({ productId: entry.id, quantity: entry.quantity })),
      initialPayment: receivedCents ? { amount: receivedCents, method: selectedMethod?.id ?? '' } : undefined,
    }, chooseOutlet ? outletId : undefined).catch(() => { submitted.current = false; setSaving(false); setError('Could not save the order. Try again.'); });
  }}>
    <div className="ad-form-fields">
      {chooseOutlet && <div className="ad-sale-field"><span>Outlet</span><SingleSelectDropdown className="ad-sale-select" label="Choose an outlet" ariaLabel="Outlet" value={outletId} options={activeOutlets.map(outlet => ({ value: outlet.id, label: outlet.displayName }))} onChange={value => { setError(''); setOutletId(value); }}/></div>}
      <h3>Customer details</h3>
      <div className="ad-form-grid">
        <label>Phone number
          <span className="ad-customer-search">
            <input aria-label="Phone number" name="phone" type="tel" inputMode="tel" placeholder="10-digit mobile number" value={phone} onChange={event => {
              lookupRequest.current += 1; setLookupState('idle'); setPhone(event.target.value); setPhoneError(''); setCustomerName('');
            }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!saving && lookupState !== 'searching') void searchCustomer(); } }} required disabled={saving} />
            <Button secondary type="button" onClick={() => void searchCustomer()} disabled={saving || lookupState === 'searching'}>{lookupState === 'searching' ? 'Searching…' : 'Search'}</Button>
          </span>
          {phoneError && <p className="ad-field-error" role="alert">{phoneError}</p>}
          {lookupState === 'found' && <p role="status" className="ad-help ad-customer-lookup-note">Existing Customer</p>}
          {lookupState === 'new' && <p role="status" className="ad-help ad-customer-lookup-note">New Customer</p>}
          {lookupState === 'error' && <p role="alert" className="ad-field-error">Could not search customers. Try again.</p>}
        </label>
        <label>Customer name<input name="name" placeholder="Optional" value={customerName} onChange={event => setCustomerName(event.target.value)} disabled={saving || lookupState === 'searching'} /></label>
      </div>
      <h3>Services</h3>
      {!entries.length && <p className="ad-order-empty">No services added. Add a service to start this order.</p>}
      {entries.map((entry, index) => {
        const product = available.find(product => product.id === entry.id);
        const options = available.filter(option => option.id === entry.id || !entries.some(other => other.key !== entry.key && other.id === option.id)).map(option => {
          const priceText = option.type === 'weight' ? (option.slabs[0] ? `from ${money(option.slabs[0].price)}` : 'by weight') : `${money(option.price)}/pc`;
          return { value: option.id, label: `${option.name} (${priceText})` };
        });
        return <div className="ad-entry" key={entry.key}>
          <div className="ad-sale-field ad-sale-service"><span>Service</span><SingleSelectDropdown className="ad-sale-select" label="Select a service" ariaLabel={'Service ' + (index + 1)} value={entry.id} options={options} onChange={id => { setError(''); setEntries(current => current.map(value => value.key === entry.key ? { ...value, id, quantity: 1 } : value)); }}/></div>
          <label>{product?.type === 'weight' ? 'Weight (kg)' : 'Pieces'}<QuantityInput key={entry.id} quantity={entry.quantity} weight={product?.type === 'weight'} disabled={!product} onChange={quantity => setEntries(entries.map(value => value.key === entry.key ? { ...value, quantity } : value))}/></label>
          <strong>{money(product ? price(product, entry.quantity) : 0)}</strong><button type="button" data-dirty className="ad-icon-button" aria-label={'Remove service ' + (index + 1)} onClick={() => setEntries(entries.filter(value => value.key !== entry.key))}>×</button>
          {product?.type === 'item' && <small>{money(product.price)} / pc</small>}
          {product?.type === 'weight' && <small>{product.slabs.map(slab => 'Up to ' + slab.limit + ' kg: ' + money(slab.price)).join(' · ')} · extra {money(product.extra)}/kg</small>}
        </div>;
      })}
      <Button secondary type="button" data-dirty disabled={entries.length >= available.length} onClick={() => setEntries([...entries, blankEntry()])}>＋ Add service</Button>
      {!available.length && <p className="ad-help">No active services are available. Ask the owner to add a service.</p>}
      <h3>Delivery & payment</h3>
      <div className="ad-form-grid">
        <label>Expected delivery<DateInput name="due" defaultValue={addDays(today(), 2)} min={today()} required /></label>
        <label>Payment method
          <select name="method" value={selectedMethod?.name ?? ''} onChange={event => { setMethodName(event.target.value); setPaidInFull(false); setReceived('0'); }} disabled={saving || !paymentMethods.length}>
            {!paymentMethods.length && <option value="">No payment methods enabled</option>}
            {paymentMethods.map(method => <option key={method.id} value={method.name}>{method.name}</option>)}
          </select>
        </label>
        {!cashOnDelivery && <label>Received now (₹)<span className="ad-sale-received">
          <input name="received" type="number" min="0" max={sum / 100} step=".01" value={effectiveReceived} onChange={event => { setPaidInFull(false); setReceived(event.target.value); }} required disabled={saving || !selectedMethod} />
          <Button secondary type="button" aria-pressed={paidInFull} className={paidInFull ? 'ad-active' : ''} disabled={!sum || saving || !selectedMethod} onClick={() => { setError(''); setPaidInFull(!paidInFull); setReceived('0'); }}>Paid in full</Button>
        </span></label>}
      </div>
      {!paymentMethods.length && <p className="ad-help" role="status">No payment methods are enabled for this organization. <Link href="/admin/profile">Enable payment methods in Profile</Link> to collect a payment now. You can still save an unpaid order.</p>}
      {cashOnDelivery && <p className="ad-help" role="status">Cash on delivery — no payment is collected now.</p>}
      <label>Order notes<textarea name="notes" placeholder="Special care instructions, pickup notes…"/></label>
    </div>
    <div className="ad-form-footer">{error && <p role="alert" className="ad-error">{error}</p>}<div className="ad-sale-totals"><span>Subtotal<strong>{money(sum)}</strong></span><span>Received now<strong>{money(shownReceived)}</strong></span><span>Balance<strong>{money(Math.max(sum - shownReceived, 0))}</strong></span></div><div className="ad-row"><Button secondary type="button" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" disabled={!available.length || saving}>{saving ? 'Saving order…' : 'Save order'}</Button></div></div>
  </form>;
}
