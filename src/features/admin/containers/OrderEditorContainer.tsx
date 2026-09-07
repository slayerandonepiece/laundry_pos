'use client';
import { useState, useRef } from 'react';
import type { Product, Line } from '../admin.types';
import { money, price, today } from '../admin.data';
import { Button, usePanelClose } from '../components/Primitives';
import type { CreateOrderInput } from '@/server/services/orders';

interface Entry { key: string; id: string; quantity: number }
const blankEntry = (): Entry => ({ key: crypto.randomUUID(), id: '', quantity: 1 });
export default function OrderEditorContainer({ products, onSave }: { products: Product[]; onSave: (input: CreateOrderInput) => Promise<void> }) {
  const onCancel = usePanelClose();
  const [entries, setEntries] = useState<Entry[]>([]), [error, setError] = useState('');
  // One key per form mount; reused across resubmits of this draft so a
  // double-click or retry can't create two orders.
  const idempotencyKey = useRef(crypto.randomUUID());
  const submitted = useRef(false), available = products.filter(product => product.active);
  const lines: Line[] = entries.flatMap(entry => {
    const product = available.find(product => product.id === entry.id);
    return product ? [{ productId: product.id, name: product.name, quantity: entry.quantity, unit: product.type === 'weight' ? 'kg' : 'pcs', amount: price(product, entry.quantity) }] : [];
  });
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  return <form className="ad-form ad-order-form" onChangeCapture={() => setError('')} onSubmit={event => {
    event.preventDefault(); if (submitted.current) return;
    const data = new FormData(event.currentTarget), phone = String(data.get('phone')).replace(/[\s()-]/g, ''), received = Math.round(Number(data.get('received')) * 100);
    if (!/^\+?[0-9]{10,15}$/.test(phone)) return setError('Enter a valid customer phone number.');
    if (!entries.length || entries.some(entry => !available.some(product => product.id === entry.id))) return setError('Add a service and choose a product for every row.');
    if (lines.some(line => line.quantity <= 0 || !Number.isFinite(line.quantity) || (line.unit === 'pcs' && !Number.isInteger(line.quantity)))) return setError('Enter a positive weight or whole-item quantity.');
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) return setError('Combine repeated services into one line.');
    if (!Number.isFinite(received) || received > sum || received < 0) return setError('Payment must be between zero and the order total.');
    submitted.current = true;
    onSave({
      idempotencyKey: idempotencyKey.current,
      customerName: String(data.get('name')).trim(),
      phone,
      dueDate: String(data.get('due')),
      notes: String(data.get('notes')).trim(),
      entries: entries.map(entry => ({ productId: entry.id, quantity: entry.quantity })),
      initialPayment: received ? { amount: received, method: String(data.get('method')) } : undefined,
    }).catch(() => { submitted.current = false; });
  }}>
    <div className="ad-form-fields">
      <h3>Customer details</h3><div className="ad-form-grid"><label>Phone number<input name="phone" type="tel" placeholder="10-digit mobile number" required/></label><label>Customer name<input name="name" placeholder="Optional"/></label></div>
      <h3>Services</h3>
      {!entries.length && <p className="ad-order-empty">No services added. Add a service to start this order.</p>}
      {entries.map((entry, index) => {
        const product = available.find(product => product.id === entry.id);
        return <div className="ad-entry" key={entry.key}>
          <label>Service<select required value={entry.id} onChange={event => setEntries(entries.map(value => value.key === entry.key ? { ...value, id: event.target.value, quantity: 1 } : value))}><option value="" disabled>Select a service</option>{available.map(product => <option key={product.id} value={product.id} disabled={entries.some(other => other.key !== entry.key && other.id === product.id)}>{product.name}</option>)}</select></label>
          <label>{product?.type === 'weight' ? 'Weight (kg)' : 'Pieces'}<input type="number" disabled={!product} min={product?.type === 'weight' ? '.001' : '1'} step={product?.type === 'weight' ? '.001' : '1'} value={entry.quantity || ''} required onChange={event => setEntries(entries.map(value => value.key === entry.key ? { ...value, quantity: Number(event.target.value) } : value))}/></label>
          <strong>{money(product ? price(product, entry.quantity) : 0)}</strong><button type="button" data-dirty className="ad-icon-button" aria-label={'Remove service ' + (index + 1)} onClick={() => setEntries(entries.filter(value => value.key !== entry.key))}>×</button>
          {product?.type === 'weight' && <small>{product.slabs.map(slab => 'Up to ' + slab.limit + ' kg: ' + money(slab.price)).join(' · ')} · extra {money(product.extra)}/kg</small>}
        </div>;
      })}
      <Button secondary type="button" data-dirty disabled={entries.length >= available.length} onClick={() => setEntries([...entries, blankEntry()])}>＋ Add service</Button>
      {!available.length && <p className="ad-help">No active services are available. Ask the owner to add a service.</p>}
      <h3>Delivery & payment</h3><div className="ad-form-grid"><label>Expected delivery<input name="due" type="date" defaultValue={today()} min={today()} required/></label><label>Received now (₹)<input name="received" type="number" min="0" max={sum / 100} step=".01" defaultValue="0" required/></label><label>Payment method<select name="method"><option>UPI</option><option>Cash</option><option>Card</option><option>Other</option></select></label></div>
      <label>Order notes<textarea name="notes" placeholder="Special care instructions, pickup notes…"/></label>
    </div>
    <div className="ad-form-footer">{error && <p role="alert" className="ad-error">{error}</p>}<span>Order total<strong>{money(sum)}</strong></span><div className="ad-row"><Button secondary type="button" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={!available.length}>Save order ↗</Button></div></div>
  </form>;
}
