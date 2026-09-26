'use client';

import { useState } from 'react';
import Icon from './Icon';
import InvoicePdfViewer from './InvoicePdfViewer';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { printInvoicePdf } from '@/lib/invoicePrint';
import { getSubscriptionInvoiceAccessAction } from '../actions/subscription-invoices.actions';

export default function InvoiceActions({ invoiceSeq }: { invoiceSeq: number }) {
  const [viewing, setViewing] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const invoiceNumber = formatInvoiceNumber(invoiceSeq);
  const viewUrl = `/super-admin/subscriptions/invoices/${invoiceSeq}/pdf`;
  const downloadUrl = `${viewUrl}?download=1`;

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  async function getPublicDownloadUrl(): Promise<string> {
    try {
      const { token } = await getSubscriptionInvoiceAccessAction(invoiceSeq);
      return `${window.location.origin}${viewUrl}?token=${token}&download=1`;
    } catch {
      return `${window.location.origin}${downloadUrl}`;
    }
  }

  async function sharePdfFile(url: string, title: string): Promise<boolean> {
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (!nav.share || !nav.canShare) return false;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load invoice PDF.');
    const blob = await response.blob();
    const file = new File([blob], `${title}.pdf`, { type: 'application/pdf' });
    if (!nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title });
    return true;
  }

  function handlePrint() {
    printInvoicePdf(viewUrl);
  }

  async function share() {
    setBusy(true);
    const title = invoiceNumber;
    try {
      const publicUrl = await getPublicDownloadUrl();
      try {
        if (await sharePdfFile(downloadUrl, title)) {
          setBusy(false);
          return;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setBusy(false);
          return;
        }
      }

      if (navigator.share) {
        try {
          await navigator.share({ title, url: publicUrl });
          setBusy(false);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            setBusy(false);
            return;
          }
        }
      }

      await navigator.clipboard.writeText(publicUrl);
      flash('Invoice link copied to clipboard');
    } catch {
      flash('Could not share automatically.');
    } finally {
      setBusy(false);
    }
  }

  async function shareViaWhatsApp() {
    setBusy(true);
    const title = invoiceNumber;
    try {
      try {
        if (await sharePdfFile(downloadUrl, title)) {
          setBusy(false);
          return;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setBusy(false);
          return;
        }
      }

      const publicUrl = await getPublicDownloadUrl();
      const message = `${title}\n${publicUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } catch {
      flash('Could not share via WhatsApp.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rowacts">
      <button type="button" className="btn outline sm" onClick={handlePrint}>
        <Icon name="printer" size="s" />Print
      </button>
      <button type="button" className="btn outline sm" onClick={() => setViewing(true)}>
        <Icon name="eye" size="s" />View PDF
      </button>
      <button
        type="button"
        className="btn sm"
        onClick={shareViaWhatsApp}
        disabled={busy}
        style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}
      >
        <Icon name="whatsapp" size="s" />Share via WhatsApp
      </button>
      <button type="button" className="btn outline sm" onClick={share} disabled={busy}>
        <Icon name="share" size="s" />Share
      </button>
      <a className="btn outline sm" href={downloadUrl}>
        <Icon name="download" size="s" />Download
      </a>
      {viewing && <InvoicePdfViewer invoiceSeq={invoiceSeq} onClose={() => setViewing(false)} />}
      {toast && <div className="ad-toast" role="status">{toast}</div>}
    </div>
  );
}
