'use client';

import { useState } from 'react';
import Dialog from './Dialog';
import PdfPreview from '@/components/PdfPreview';
import Icon from './Icon';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { shareInvoice } from '@/lib/invoiceShare';
import { printInvoicePdf } from '@/lib/invoicePrint';
import { getSubscriptionInvoiceAccessAction } from '../actions/subscription-invoices.actions';

function InvoicePdfContent({ invoiceSeq, onClose }: { invoiceSeq: number; onClose: () => void }) {
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

  async function deliver(whatsApp = false) {
    if (sharing) return;
    setSharing(true);
    try {
      const publicUrl = await getPublicUrl();
      const result = await shareInvoice({ downloadUrl, publicUrl, title: invoiceNumber, whatsApp });
      if (result === 'copied') flash('Invoice link copied to clipboard');
    } catch { flash('Could not share the invoice. Try again.'); }
    finally { setSharing(false); }
  }

  /** Header action buttons — rendered inline with the dialog title row */
  const headerActions = (
    <>
      <button type="button" className="btn outline sm" onClick={handlePrint} title="Print PDF directly">
        <Icon name="printer" size="s" />Print
      </button>
      <button type="button" className="btn outline sm" onClick={() => void deliver()} disabled={sharing} title="Share invoice PDF">
        <Icon name="share" size="s" />Share
      </button>
      <button
        type="button"
        className="btn outline sm"
        onClick={() => void deliver(true)} disabled={sharing}
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
        <PdfPreview key={viewUrl} src={viewUrl} title={`Invoice ${invoiceNumber}`} />
      </div>
      {toast && <div className="ad-toast" role="status">{toast}</div>}
    </Dialog>
  );
}

export default function InvoicePdfViewer(props: { invoiceSeq: number; onClose: () => void }) {
  return <InvoicePdfContent key={props.invoiceSeq} {...props} />;
}
