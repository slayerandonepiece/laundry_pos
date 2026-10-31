'use client';
import { useRef, useState } from 'react';
import { Button } from './Primitives';
import OrderInvoicePdfViewer from './OrderInvoicePdfViewer';
import { getOrderInvoiceAccessAction } from '../actions/order-invoices.actions';

type InvoiceAccess = { invoiceNumber: string; accessToken: string };

export default function OrderInvoiceActions({ orderCode, disabled = false }: { orderCode: string; disabled?: boolean }) {
  const accessRef = useRef<InvoiceAccess | null>(null);
  const [access, setAccess] = useState<InvoiceAccess | null>(null);
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open() {
    if (disabled || busy) return;
    setBusy(true); setError('');
    try {
      const resolved = accessRef.current ?? await getOrderInvoiceAccessAction(orderCode);
      accessRef.current = resolved;
      setAccess(resolved); setViewing(true);
    } catch { setError('Could not open the invoice. Try again.'); }
    finally { setBusy(false); }
  }

  return <div className="ad-order-invoice-actions">
    <Button secondary type="button" disabled={disabled || busy} onClick={() => void open()}>{busy ? 'Opening…' : 'Invoice'}</Button>
    {error && <span className="ad-error" role="alert">{error}</span>}
    {viewing && access && <OrderInvoicePdfViewer orderCode={orderCode} invoiceNumber={access.invoiceNumber} accessToken={access.accessToken} onClose={() => setViewing(false)} />}
  </div>;
}
