import { notFound } from 'next/navigation';
import styles from './invoice-view.module.css';
import PdfPreview from '@/components/PdfPreview';
import InvoicePrintButton from '@/components/InvoicePrintButton';
import { formatInvoiceNumber } from '@/lib/invoiceNumber';
import { getOrderInvoiceByToken } from '@/server/services/order-invoices';

export const dynamic = 'force-dynamic';

export default async function InvoiceView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getOrderInvoiceByToken(token);
  if (!invoice) notFound();
  const title = `Invoice ${formatInvoiceNumber(invoice.invoiceSeq)}`;
  const pdfUrl = `/i/${token}`;
  return <main className={`ad-root ${styles.invoice}`} style={{ minHeight: '100vh', background: '#e5e7eb', padding: '16px' }}>
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', maxWidth: '900px', margin: '0 auto 16px' }}>
      <h1 style={{ fontSize: '20px', margin: 0 }}>{title}</h1>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <InvoicePrintButton />
        <a className="ad-button" href={`${pdfUrl}?download=1`} download>Download PDF</a>
      </div>
    </header>
    <div style={{ maxWidth: '900px', margin: '0 auto' }}><PdfPreview src={pdfUrl} title={title} /></div>
  </main>;
}
