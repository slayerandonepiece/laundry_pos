'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPaymentMethodAction, renamePaymentMethodAction, setPaymentMethodActiveAction } from '../actions/payment-methods.actions';
import type { StorePaymentMethod } from '../admin.types';
import { Button } from './Primitives';

export default function PaymentMethodsSettings({ methods }: { methods: StorePaymentMethod[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (!result.ok) return setError(result.error || 'Could not update payment methods.');
      setName('');
      setEditingId(null);
      router.refresh();
    } catch {
      setError('Could not update payment methods. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="ad-card ad-account-card">
    <div className="ad-card-heading"><div><h2>Payment methods</h2><p>Choose what customers can use at this store.</p></div></div>
    <div className="ad-payment-method-list">
      {methods.map(method => <div className="ad-payment-method-row" key={method.id}>
        {editingId === method.id ? <>
          <label className="ad-payment-method-edit">Method name<input value={editingName} maxLength={40} onChange={event => setEditingName(event.target.value)} /></label>
          <Button type="button" disabled={busy} onClick={() => run(() => renamePaymentMethodAction(method.id, editingName))}>Save</Button>
          <Button secondary type="button" disabled={busy} onClick={() => setEditingId(null)}>Cancel</Button>
        </> : <>
          <div><strong>{method.name}</strong><small>{method.active ? 'Available at checkout' : 'Inactive · kept in payment history'}</small></div>
          <Button secondary type="button" disabled={busy} onClick={() => { setEditingId(method.id); setEditingName(method.name); }}>Rename</Button>
          <Button secondary type="button" disabled={busy} onClick={() => run(() => setPaymentMethodActiveAction(method.id, !method.active))}>{method.active ? 'Deactivate' : 'Activate'}</Button>
        </>}
      </div>)}
    </div>
    <form className="ad-form ad-payment-method-add" onSubmit={event => { event.preventDefault(); run(() => addPaymentMethodAction(name)); }}>
      <label>Add payment method<input value={name} maxLength={40} placeholder="e.g. Card or Bank transfer" onChange={event => setName(event.target.value)} required /></label>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add method'}</Button>
    </form>
    {error && <p className="ad-error" role="alert">{error}</p>}
  </div>;
}
