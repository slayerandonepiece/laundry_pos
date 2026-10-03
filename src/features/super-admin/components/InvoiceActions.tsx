'use client';

import Icon from './Icon';
import InvoicePdfViewer from './InvoicePdfViewer';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { getSubscriptionInvoiceAccessAction } from '../actions/subscription-invoices.actions';
import PdfActions from '@/components/PdfActions';

export default function InvoiceActions({ invoiceSeq }: { invoiceSeq: number }) {
  const invoiceNumber = formatInvoiceNumber(invoiceSeq);
  const viewUrl = `/super-admin/subscriptions/invoices/${invoiceSeq}/pdf`;
  const downloadUrl = `${viewUrl}?download=1`;

  async function getPublicUrl(): Promise<string> {
    try {
      const { token } = await getSubscriptionInvoiceAccessAction(invoiceSeq);
      return `${window.location.origin}${viewUrl}?token=${token}&download=1`;
    } catch {
      return `${window.location.origin}${downloadUrl}`;
    }
  }

  function SABtn({ children, secondary = true, ...p }: React.ComponentPropsWithoutRef<'button'> & { secondary?: boolean }) {
    return <button {...p} className={`btn ${secondary ? 'outline ' : ''}sm`}>{children}</button>;
  }

  return (
    <PdfActions
      className="rowacts"
      downloadClassName="btn outline sm"
      toastClassName="toast-fixed"
      viewUrl={viewUrl}
      downloadUrl={downloadUrl}
      title={invoiceNumber}
      getPublicUrl={getPublicUrl}
      ButtonComponent={SABtn}
      whatsappSecondary={false}
      icons={{
        print: <Icon name="printer" size="s" />,
        view: <Icon name="eye" size="s" />,
        whatsapp: <Icon name="whatsapp" size="s" />,
        share: <Icon name="share" size="s" />,
        download: <Icon name="download" size="s" />,
      }}
      labels={{
        whatsapp: 'WhatsApp',
        download: 'Download',
      }}
      viewer={onClose => <InvoicePdfViewer invoiceSeq={invoiceSeq} onClose={onClose} />}
    />
  );
}
