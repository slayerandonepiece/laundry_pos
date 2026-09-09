'use client';
import { Panel } from '@/features/admin/components/Primitives';
import Icon from './Icon';

export default function InvoicePdfViewer({ invoiceSeq, onClose }: { invoiceSeq: number; onClose: () => void }) {
  const viewUrl = `/super-admin/subscriptions/invoices/${invoiceSeq}/pdf`;
  return (
    <Panel title={`Invoice #${invoiceSeq}.pdf`} onClose={onClose} warnOnChanges={false}>
      <div className="ad-pdf-viewer">
        <div className="ad-pdf-toolbar">
          <a className="btn outline sm" href={viewUrl} target="_blank" rel="noreferrer"><Icon name="externalLink" size="s" />Open in new tab</a>
          <a className="btn sm" href={`${viewUrl}?download=1`}><Icon name="download" size="s" />Download</a>
        </div>
        <iframe src={viewUrl} title={`Invoice #${invoiceSeq} PDF`} className="ad-pdf-frame" />
      </div>
    </Panel>
  );
}
