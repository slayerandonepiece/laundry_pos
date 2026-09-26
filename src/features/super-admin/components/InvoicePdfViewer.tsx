'use client';

import { useState } from 'react';
import Dialog from './Dialog';
import Icon from './Icon';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { printInvoicePdf } from '@/lib/invoicePrint';
import { getSubscriptionInvoiceAccessAction } from '../actions/subscription-invoices.actions';

export default function InvoicePdfViewer({ invoiceSeq, onClose }: { invoiceSeq: number; onClose: () => void }) {
  const [toast, setToast] = useState('');
  const [sharing, setSharing] = useState(false);

  const invoiceNumber = formatInvoiceNumber(invoiceSeq);
  const viewUrl = `/super-admin/subscriptions/invoices/${invoiceSeq}/pdf`;
  const downloadUrl = `${viewUrl}?download=1`;

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  async function getPublicUrl(): Promise<string> {
    try {
      const { token } = await getSubscriptionInvoiceAccessAction(invoiceSeq);
      return `${window.location.origin}${viewUrl}?token=${token}`;
    } catch {
      return `${window.location.origin}${viewUrl}`;
    }
  }

  async function handlePrint() {
    printInvoicePdf(viewUrl);
  }

  async function handleShare() {
    setSharing(true);
    try {
      const publicUrl = await getPublicUrl();
      const title = invoiceNumber;

      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.share && nav.canShare) {
        try {
          const res = await fetch(downloadUrl);
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], `${invoiceNumber}.pdf`, { type: 'application/pdf' });
            if (nav.canShare({ files: [file] })) {
              await nav.share({ files: [file], title });
              setSharing(false);
              return;
            }
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') { setSharing(false); return; }
        }
      }

      if (navigator.share) {
        try {
          await navigator.share({ title, url: publicUrl });
          setSharing(false);
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') { setSharing(false); return; }
        }
      }

      await navigator.clipboard.writeText(publicUrl);
      flash('Invoice link copied to clipboard');
    } catch {
      flash('Could not share. Please use download button.');
    } finally {
      setSharing(false);
    }
  }

  async function handleWhatsAppShare() {
    try {
      const publicUrl = await getPublicUrl();
      const message = `${invoiceNumber}\n${publicUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } catch {
      flash('Could not prepare WhatsApp share.');
    }
  }

  /** Header action buttons — rendered inline with the dialog title row */
  const headerActions = (
    <>
      <button type="button" className="btn outline sm" onClick={handlePrint} title="Print PDF directly">
        <Icon name="printer" size="s" />Print
      </button>
      <button type="button" className="btn outline sm" onClick={handleShare} disabled={sharing} title="Share invoice PDF">
        <Icon name="share" size="s" />Share
      </button>
      <button
        type="button"
        className="btn outline sm"
        onClick={handleWhatsAppShare}
        title="Share via WhatsApp"
        style={{ color: '#059669', borderColor: '#a7f3d0' }}
      >
        <Icon name="whatsapp" size="s" />WhatsApp
      </button>
      <a className="btn outline sm" href={viewUrl} target="_blank" rel="noreferrer" title="Open in new tab">
        <Icon name="externalLink" size="s" />Open
      </a>
      <a className="btn sm" href={downloadUrl} title="Download PDF">
        <Icon name="download" size="s" />Download
      </a>
    </>
  );

  return (
    <Dialog
      title={`Invoice ${invoiceNumber}`}
      size="xl"
      onClose={onClose}
      warnOnChanges={false}
      headerActions={headerActions}
    >
      <div className="ad-pdf-viewer">
        <iframe src={viewUrl} title={`Invoice ${invoiceNumber} PDF`} className="ad-pdf-frame" />
      </div>
      {toast && <div className="ad-toast" role="status">{toast}</div>}
    </Dialog>
  );
}
