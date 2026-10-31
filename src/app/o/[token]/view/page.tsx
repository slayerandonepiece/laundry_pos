import { notFound } from 'next/navigation';
import styles from '../../../i/[token]/view/invoice-view.module.css';
import PdfPreview from '@/components/PdfPreview';
import InvoicePrintButton from '@/components/InvoicePrintButton';
import { getOrderSlipByToken } from '@/server/services/order-slips';

export const dynamic = 'force-dynamic';

export default async function OrderSlipView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const slip = await getOrderSlipByToken(token);
  if (!slip) notFound();
  const pdfUrl = `/o/${token}`;
  return <main className={`ad-root ${styles.invoice}`}>
    <div className={styles.page}><PdfPreview src={pdfUrl} title={`Order ${slip.orderCode}`} /></div>
    <div className={styles.actions}>
      <InvoicePrintButton />
      <a className="ad-button" href={`${pdfUrl}?download=1`} download>Download PDF</a>
    </div>
  </main>;
}
