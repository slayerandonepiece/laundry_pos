'use client';
import { useState } from 'react';
import Icon from './Icon';
import InvoicePdfViewer from './InvoicePdfViewer';

export default function InvoiceActions({ invoiceSeq }: { invoiceSeq: number }) {
  const [viewing, setViewing] = useState(false);
  const [toast, setToast] = useState('');

  const viewUrl = `/super-admin/subscriptions/invoices/${invoiceSeq}/pdf`;
  const downloadUrl = `${viewUrl}?download=1`;

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  async function share() {
    const absoluteUrl = `${window.location.origin}${downloadUrl}`;
    const title = `Invoice #${invoiceSeq}`;

    // Prefer sharing the actual PDF file (WhatsApp/Mail/Messages/AirDrop
    // all accept it) where the platform supports file sharing.
    try {
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.share && nav.canShare) {
        const res = await fetch(downloadUrl);
        const blob = await res.blob();
        const file = new File([blob], `invoice-${invoiceSeq}.pdf`, { type: 'application/pdf' });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title });
          return;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }

    // Fall back to sharing just the link when file sharing isn't supported.
    if (navigator.share) {
      try {
        await navigator.share({ title, url: absoluteUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    // No Web Share API at all (mainly desktop Firefox) — copy the link instead.
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      flash('Link copied to clipboard');
    } catch {
      flash('Could not share automatically — copy this link: ' + absoluteUrl);
    }
  }

  function shareViaWhatsApp() {
    // Link-only by design: a wa.me link can't carry file bytes, only text.
    // Opens WhatsApp Web on desktop (if logged in) or hands off to the
    // native app on mobile — no platform detection needed. The PDF itself
    // is never attached here; the native OS share sheet above (`share()`)
    // is the only path that can hand over the actual file.
    const absoluteUrl = `${window.location.origin}${viewUrl}`;
    const message = `Invoice #${invoiceSeq}\n${absoluteUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="rowacts">
      <button type="button" className="btn outline sm" onClick={() => window.print()}><Icon name="printer" size="s" />Print</button>
      <button type="button" className="btn outline sm" onClick={() => setViewing(true)}><Icon name="eye" size="s" />View PDF</button>
      <button type="button" className="btn outline sm" onClick={share}><Icon name="share" size="s" />Share</button>
      <button type="button" className="btn outline sm" onClick={shareViaWhatsApp}><Icon name="whatsapp" size="s" />Share via WhatsApp</button>
      <a className="btn sm" href={downloadUrl}><Icon name="download" size="s" />Download PDF</a>
      {viewing && <InvoicePdfViewer invoiceSeq={invoiceSeq} onClose={() => setViewing(false)} />}
      {toast && <div className="ad-toast" role="status">{toast}</div>}
    </div>
  );
}
