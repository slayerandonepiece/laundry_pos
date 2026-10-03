'use client';

import { useState } from 'react';
import PdfPreview from '@/components/PdfPreview';
import { Panel } from './Primitives';
import Icon from '@/features/super-admin/components/Icon';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { printInvoicePdf } from '@/lib/invoicePrint';
import { openWhatsAppInvoice, shareInvoice } from '@/lib/invoiceShare';

type Props = { orderCode: string; invoiceSeq: number; accessToken: string; onClose: () => void };

function OrderInvoicePdfContent({ orderCode, invoiceSeq, accessToken, onClose }: Props) {
  const viewUrl = `/admin/orders/${orderCode}/invoice/pdf`;
  const invoiceNumber = formatInvoiceNumber(invoiceSeq);
  const tokenUrl = `/i/${accessToken}`;
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');

  async function deliver(whatsApp = false) {
    if (whatsApp) {
      openWhatsAppInvoice(`${window.location.origin}${tokenUrl}/view`, invoiceNumber);
      return;
    }
    if (sharing) return;
    setSharing(true);
    try {
      const publicUrl = `${window.location.origin}${tokenUrl}`;
      const result = await shareInvoice({ downloadUrl: publicUrl, publicUrl: `${publicUrl}/view`, title: invoiceNumber });
      if (result === 'copied') setToast('Invoice link copied to clipboard');
    } catch { setToast('Could not share the invoice. Try again.'); }
    finally { setSharing(false); }
  }

  const heading = <div className="ad-order-pdf-heading">
    <h2>Invoice {invoiceNumber}</h2>
    <div className="ad-order-pdf-actions">
      <button type="button" className="ad-button ad-secondary" onClick={() => printInvoicePdf(viewUrl)}><Icon name="printer" />Print</button>
      <button type="button" className="ad-button ad-secondary" disabled={sharing} onClick={() => void deliver()}><Icon name="share" />Share</button>
      <button type="button" className="ad-button ad-secondary ad-pdf-whatsapp" disabled={sharing} onClick={() => void deliver(true)}><Icon name="whatsapp" />WhatsApp</button>
      <a className="ad-button ad-secondary" href={`${tokenUrl}/view`} target="_blank" rel="noreferrer"><Icon name="externalLink" />Open</a>
      <a className="ad-button" href={`${tokenUrl}?download=1`} download><Icon name="download" />Download</a>
    </div>
  </div>;

  return <Panel title={`Invoice ${invoiceNumber}`} headerContent={heading} onClose={onClose} warnOnChanges={false} variant="modal">
    <div className="ad-pdf-viewer"><PdfPreview key={viewUrl} src={viewUrl} title={`Invoice ${invoiceNumber}`} /></div>
    {toast && <div className="ad-toast" role="status">{toast}</div>}
  </Panel>;
}

export default function OrderInvoicePdfViewer(props: Props) {
  return <OrderInvoicePdfContent key={props.orderCode} {...props} />;
}
