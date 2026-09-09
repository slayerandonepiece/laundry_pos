import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getInvoice, getStore } from '@/server/services/stores';
import InvoiceDetail from '@/features/super-admin/components/InvoiceDetail';

export default async function Page({ params }: { params: Promise<{ invoiceSeq: string }> }) {
  const { invoiceSeq } = await params;
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const seq = Number(invoiceSeq);
  const invoice = Number.isFinite(seq) ? await getInvoice(seq) : null;
  if (!invoice) notFound();
  const store = await getStore(invoice.storeId);
  if (!store) notFound();
  return <InvoiceDetail invoice={invoice} store={store} />;
}
