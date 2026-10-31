'use client';

import { useState } from 'react';
import PdfPreview from '@/components/PdfPreview';
import { Panel } from './Primitives';
import Icon from '@/features/super-admin/components/Icon';
import { printInvoicePdf } from '@/lib/invoicePrint';
import { openWhatsAppInvoice, shareInvoice } from '@/lib/invoiceShare';

// The one invoice dialog for the store workspace (customer order invoices and the
// owner's own subscription invoices). `previewUrl` is the signed-in route used to
// render and print; `getPublicLinks` returns the opaque public URLs for sharing.
// Open and Download default to the preview route unless a public page is given.
export type InvoiceLinks = { downloadUrl: string; viewUrl: string };
type Props = {
  number: string;
  previewUrl: string;
  openUrl?: string;
  downloadUrl?: string;
  getPublicLinks: () => Promise<InvoiceLinks>;
  onClose: () => void;
};

export default function InvoiceViewerPanel({ number, previewUrl, openUrl = previewUrl, downloadUrl = `${previewUrl}?download=1`, getPublicLinks, onClose }: Props) {
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');

  async function deliver(whatsApp = false) {
    if (sharing) return;
    setSharing(true);
    try {
      const links = await getPublicLinks();
      if (whatsApp) openWhatsAppInvoice(links.viewUrl, number);
      else if (await shareInvoice({ downloadUrl: links.downloadUrl, publicUrl: links.viewUrl, title: number }) === 'copied') setToast('Invoice link copied to clipboard');
    } catch { setToast('Could not share the invoice. Try again.'); }
    finally { setSharing(false); }
  }

  const heading = <div className="ad-order-pdf-heading">
    <h2>Invoice {number}</h2>
    <div className="ad-order-pdf-actions">
      <button type="button" className="ad-button ad-secondary" onClick={() => printInvoicePdf(previewUrl)}><Icon name="printer" />Print</button>
      <button type="button" className="ad-button ad-secondary" disabled={sharing} onClick={() => void deliver()}><Icon name="share" />Share</button>
      <button type="button" className="ad-button ad-secondary ad-pdf-whatsapp" disabled={sharing} onClick={() => void deliver(true)}><Icon name="whatsapp" />WhatsApp</button>
      <a className="ad-button ad-secondary" href={openUrl} target="_blank" rel="noreferrer"><Icon name="externalLink" />Open</a>
      <a className="ad-button" href={downloadUrl} download><Icon name="download" />Download</a>
    </div>
  </div>;

  return <Panel title={`Invoice ${number}`} headerContent={heading} onClose={onClose} warnOnChanges={false} variant="modal">
    <div className="ad-pdf-viewer"><PdfPreview key={previewUrl} src={previewUrl} title={`Invoice ${number}`} /></div>
    {toast && <div className="ad-toast" role="status">{toast}</div>}
  </Panel>;
}
