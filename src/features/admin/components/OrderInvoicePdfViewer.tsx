'use client';

import { Panel } from './Primitives';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { printInvoicePdf } from '@/lib/invoicePrint';

export default function OrderInvoicePdfViewer({ orderCode, invoiceSeq, onClose }: { orderCode: string; invoiceSeq: number; onClose: () => void }) {
  const viewUrl = `/admin/orders/${orderCode}/invoice/pdf`;
  const title = `${formatInvoiceNumber(invoiceSeq)}.pdf`;

  return (
    <Panel title={title} onClose={onClose} warnOnChanges={false} variant="modal">
      <div className="ad-pdf-viewer">
        <div className="ad-pdf-toolbar">
          <button type="button" className="ad-button ad-secondary" onClick={() => printInvoicePdf(viewUrl)}>
            Print
          </button>
          <a className="ad-button ad-secondary" href={viewUrl} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
          <a className="ad-button" href={`${viewUrl}?download=1`}>
            Download
          </a>
        </div>
        <iframe src={viewUrl} title={`${title} PDF`} className="ad-pdf-frame" />
      </div>
    </Panel>
  );
}
