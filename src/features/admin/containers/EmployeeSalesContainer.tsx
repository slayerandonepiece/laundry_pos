'use client';
import { useEffect, useRef, useState } from 'react';

import type { Line, Product, StorePaymentMethod } from '../admin.types';
import type { SaleDraft } from '../pos.types';
import { money, price, today } from '../admin.data';
import { useAdmin } from './AdminProvider';
import { createOrderAction } from '../actions/orders.actions';
import ServiceGrid from '../components/ServiceGrid';
import OrderCart from '../components/OrderCart';
import QuantityForm from '../components/QuantityForm';
import { Panel } from '../components/Primitives';
import ConfirmationDialog from '../components/ConfirmationDialog';

const blank = (paymentMethods: StorePaymentMethod[]): SaleDraft => ({ entries: [], phone: '', name: '', due: today(), received: '0', method: paymentMethods[0]?.name ?? '', notes: '' });
export default function EmployeeSalesContainer({ products: catalogue, paymentMethods }: { products: Product[]; paymentMethods: StorePaymentMethod[] }) {
  const { user } = useAdmin();
  const [draft, setDraft] = useState<SaleDraft>(() => blank(paymentMethods)), [ready, setReady] = useState(false), [storageNote, setStorageNote] = useState('');
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All'), [cartOpen, setCartOpen] = useState(false);
  const [selection, setSelection] = useState<{ product: Product; editing: boolean } | null>(null), [clear, setClear] = useState(false);
  const [error, setError] = useState(''), [saved, setSaved] = useState<string | null>(null), [busy, setBusy] = useState(false), submitted = useRef(false);
  // One key per draft; reused across resubmits so a double-click or retry
  // can't create two orders. Regenerated whenever the draft is cleared.
  const idempotencyKey = useRef(crypto.randomUUID());
  const key = 'express-laundry-sale-draft-' + user?.id;
  useEffect(() => {
    try { const raw = sessionStorage.getItem(key); if (raw) { const value = JSON.parse(raw); if (Array.isArray(value.entries) && typeof value.phone === 'string' && typeof value.due === 'string') {
      // Restore this employee's tab-local draft after navigation or refresh.
      const restored = { ...blank(paymentMethods), ...value };
      // Restoring browser storage is the external synchronization performed
      // by this mount effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({ ...restored, method: paymentMethods.some(method => method.name === restored.method) ? restored.method : paymentMethods[0]?.name ?? '' });
    } } } catch { setStorageNote('Draft recovery is unavailable. Keep this page open until you save.'); }
    setReady(true);
  }, [key, paymentMethods]);
  useEffect(() => { if (ready) { try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* Keep the in-memory draft usable. */ } } }, [draft, key, ready]);
  const products = catalogue.filter(p => p.active && (p.type === 'item' || p.slabs.length > 0));
  const lines: Line[] = draft.entries.flatMap(entry => { const product = products.find(p => p.id === entry.productId); return product ? [{ productId: product.id, name: product.name, quantity: entry.quantity, unit: product.type === 'weight' ? 'kg' : 'pcs', amount: price(product, entry.quantity) }] : []; });
  const amount = lines.reduce((sum, line) => sum + line.amount, 0);
  const change = (patch: Partial<SaleDraft>) => { submitted.current = false; setDraft(previous => ({ ...previous, ...patch })); setError(''); };
  const setItemQuantity = (productId: string, quantity: number) => change({ entries: quantity > 0
    ? draft.entries.some(entry => entry.productId === productId)
      ? draft.entries.map(entry => entry.productId === productId ? { ...entry, quantity } : entry)
      : [...draft.entries, { productId, quantity }]
    : draft.entries.filter(entry => entry.productId !== productId) });
  function punchOrder() {
    if (submitted.current || !user) return;
    const phone = draft.phone.replace(/[\s()-]/g, ''), received = Math.round(Number(draft.received) * 100);
    if (!/^\+?[0-9]{10,15}$/.test(phone)) return setError('Enter a valid customer phone number.');
    if (!lines.length || lines.length !== draft.entries.length) return setError('A service is no longer available. Clear the order and choose available services.');
    if (lines.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0 || (l.unit === 'pcs' && !Number.isInteger(l.quantity)))) return setError('Enter valid quantities for every service.');
    if (!Number.isSafeInteger(amount) || lines.some(line => !Number.isSafeInteger(line.amount))) return setError('This quantity is too large. Enter a smaller amount.');
    if (!draft.due || draft.due < today()) return setError('Choose today or a future delivery date.');
    if (!Number.isFinite(received) || received < 0 || received > amount) return setError('Received amount must be between zero and the order total.');
    submitted.current = true; setBusy(true);
    createOrderAction({
      idempotencyKey: idempotencyKey.current,
      customerName: draft.name.trim(),
      phone,
      dueDate: draft.due,
      notes: draft.notes.trim(),
      entries: draft.entries.map(entry => ({ productId: entry.productId, quantity: entry.quantity })),
      initialPayment: received ? { amount: received, method: draft.method } : undefined,
    }).then(order => {
      idempotencyKey.current = crypto.randomUUID();
      setDraft(blank(paymentMethods)); setCartOpen(false); setSaved(order.id);
    }).catch(() => {
      submitted.current = false;
      setError('Could not save the order. Try again.');
    }).finally(() => setBusy(false));
  }
  const cart = <OrderCart draft={draft} lines={lines} paymentMethods={paymentMethods} error={error} busy={busy} onChange={change} onEdit={id => { const product = products.find(p => p.id === id); if (product) setSelection({ product, editing: true }); }} onRemove={id => setItemQuantity(id, 0)} onIncrement={id => setItemQuantity(id, (draft.entries.find(entry => entry.productId === id)?.quantity || 0) + 1)} onDecrement={id => setItemQuantity(id, (draft.entries.find(entry => entry.productId === id)?.quantity || 0) - 1)} onClear={() => setClear(true)} onSubmit={punchOrder}/>;
  if (!ready) return <p>Restoring your sale…</p>;
  return <>
    {storageNote && <p className="ad-help">{storageNote}</p>}
    <div className="ad-pos"><ServiceGrid products={products.filter(p => (category === 'All' || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase()))} categories={[...new Set(products.map(p => p.category))]} query={query} category={category} quantities={Object.fromEntries(draft.entries.map(entry => [entry.productId, entry.quantity]))} onQuery={setQuery} onCategory={setCategory} onAdd={product => setSelection({ product, editing: Boolean(draft.entries.find(entry => entry.productId === product.id)) })} onIncrement={product => setItemQuantity(product.id, (draft.entries.find(entry => entry.productId === product.id)?.quantity || 0) + 1)} onDecrement={product => setItemQuantity(product.id, (draft.entries.find(entry => entry.productId === product.id)?.quantity || 0) - 1)}/></div>
    <button className="ad-pos-mobile-cart ad-button" onClick={() => setCartOpen(true)}>View order · {lines.length} services · {money(amount)}</button>
    {cartOpen && <Panel title="New sale" warnOnChanges={false} onClose={() => setCartOpen(false)}>{cart}</Panel>}
    {selection && <Panel variant="compact" title={selection.product.name} warnOnChanges={false} onClose={() => setSelection(null)}><QuantityForm product={selection.product} existing={draft.entries.find(e => e.productId === selection.product.id)?.quantity ?? 0} quantity={selection.editing ? draft.entries.find(e => e.productId === selection.product.id)?.quantity : undefined} onCancel={() => setSelection(null)} onConfirm={quantity => {
      const id = selection.product.id, existing = draft.entries.find(e => e.productId === id);
      change({ entries: existing ? draft.entries.map(e => e.productId === id ? { ...e, quantity: selection.editing ? quantity : Math.round((e.quantity + quantity) * 1000) / 1000 } : e) : [...draft.entries, { productId: id, quantity }] }); setSelection(null);
    }}/></Panel>}
    {clear && <ConfirmationDialog title="Clear this order?" description="The selected services and customer details will be removed from this draft." confirmLabel="Clear order" onCancel={() => setClear(false)} onConfirm={() => { idempotencyKey.current = crypto.randomUUID(); setDraft(blank(paymentMethods)); setError(''); setClear(false); }}/>}
    {saved && <div className="ad-toast" role="status">Order {saved} saved · Pending <button aria-label="Dismiss saved notice" onClick={() => setSaved(null)}>×</button></div>}
  </>;
}
