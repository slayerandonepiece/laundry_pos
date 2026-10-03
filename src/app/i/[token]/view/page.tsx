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
  // The invoice comes first and fills the width; the actions sit below it.
  return <main className={`ad-root ${styles.invoice}`}>
    <div className={styles.page}><PdfPreview src={pdfUrl} title={title} /></div>
    <div className={styles.actions}>
      <InvoicePrintButton />
      <a className="ad-button" href={`${pdfUrl}?download=1`} download>Download PDF</a>
    </div>
  </main>;
}
