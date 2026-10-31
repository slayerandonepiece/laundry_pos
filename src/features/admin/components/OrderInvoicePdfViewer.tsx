'use client';

import InvoiceViewerPanel from './InvoiceViewerPanel';

type Props = { orderCode: string; invoiceNumber: string; accessToken: string; onClose: () => void };

export default function OrderInvoicePdfViewer({ orderCode, invoiceNumber, accessToken, onClose }: Props) {
  const tokenUrl = `/i/${accessToken}`;
  return <InvoiceViewerPanel key={orderCode} number={invoiceNumber} previewUrl={`/admin/orders/${orderCode}/invoice/pdf`} openUrl={`${tokenUrl}/view`} downloadUrl={`${tokenUrl}?download=1`}
    getPublicLinks={async () => ({ downloadUrl: `${window.location.origin}${tokenUrl}`, viewUrl: `${window.location.origin}${tokenUrl}/view` })} onClose={onClose} />;
}
