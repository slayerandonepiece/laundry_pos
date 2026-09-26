'use client';
import { useState } from 'react';
import { Button } from './Primitives';
import OrderInvoicePdfViewer from './OrderInvoicePdfViewer';
import { getOrderInvoiceAccessAction } from '../actions/order-invoices.actions';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';

import { printInvoicePdf } from '@/lib/invoicePrint';

type InvoiceAccess = { invoiceSeq: number; accessToken: string };

export default function OrderInvoiceActions({ orderCode }: { orderCode: string }) {
  const [viewing, setViewing] = useState(false);
  const [toast, setToast] = useState('');
  const [access, setAccess] = useState<InvoiceAccess | null>(null);
  const viewUrl = '/admin/orders/' + orderCode + '/invoice/pdf';
  const downloadUrl = viewUrl + '?download=1';

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  async function ensureInvoiceAccess(): Promise<InvoiceAccess> {
    if (access) return access;
    const resolved = await getOrderInvoiceAccessAction(orderCode);
    setAccess(resolved);
    return resolved;
  }

  function customerUrl(invoiceAccess: InvoiceAccess) {
    return window.location.origin + '/i/' + invoiceAccess.accessToken;
  }

  async function sharePdfFile(url: string, title: string): Promise<boolean> {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (!nav.share || !nav.canShare) return false;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load invoice PDF.');
    const blob = await response.blob();
    const file = new File([blob], title + '.pdf', { type: 'application/pdf' });
    if (!nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title });
    return true;
  }

  async function printInvoice() {
    try { await ensureInvoiceAccess(); }
    catch { return flash('Could not open the invoice. Try again.'); }
    printInvoicePdf(viewUrl);
  }

  async function view() {
    try { await ensureInvoiceAccess(); setViewing(true); }
    catch { flash('Could not open the invoice. Try again.'); }
  }

  async function share() {
    let resolved: InvoiceAccess;
    try { resolved = await ensureInvoiceAccess(); }
    catch { return flash('Could not open the invoice. Try again.'); }
    const url = customerUrl(resolved);
    const title = formatInvoiceNumber(resolved.invoiceSeq);

    try { if (await sharePdfFile(url + '?download=1', title)) return; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }

    if (navigator.share) {
      try { await navigator.share({ title, url }); return; }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('Customer invoice link copied to clipboard');
    } catch {
      flash('Could not share automatically — copy this link: ' + url);
    }
  }

  async function shareViaWhatsApp() {
    let resolved: InvoiceAccess;
    try { resolved = await ensureInvoiceAccess(); }
    catch { return flash('Could not open the invoice. Try again.'); }
    const url = customerUrl(resolved);
    const title = formatInvoiceNumber(resolved.invoiceSeq);

    try { if (await sharePdfFile(url + '?download=1', title)) return; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }

    flash("WhatsApp doesn't support direct file sharing on this browser — sending a link instead");
    const message = title + '\n' + url;
    window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
  }

  return <div className="ad-order-invoice-actions">
    <Button secondary type="button" onClick={printInvoice}>Print</Button>
    <Button secondary type="button" onClick={view}>View PDF</Button>
    <Button secondary type="button" onClick={share}>Share</Button>
    <Button secondary type="button" onClick={shareViaWhatsApp}>Share via WhatsApp</Button>
    <a className="ad-button" href={downloadUrl}>Download PDF</a>
    {viewing && access && <OrderInvoicePdfViewer orderCode={orderCode} invoiceSeq={access.invoiceSeq} onClose={() => setViewing(false)} />}
    {toast && <div className="ad-toast" role="status">{toast}</div>}
  </div>;
}
