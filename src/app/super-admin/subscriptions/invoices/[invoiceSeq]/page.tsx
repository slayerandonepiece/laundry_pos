import { redirect, notFound } from 'next/navigation';
import { requireSuperAdmin, AuthError } from '@/server/auth/session';
import { getInvoice, getStore } from '@/server/services/stores';
import SuperAdminPageShell from '@/features/super-admin/containers/SuperAdminPageShell';
import InvoiceDetail from '@/features/super-admin/components/InvoiceDetail';

export default async function Page({ params }: { params: Promise<{ invoiceSeq: string }> }) {
  const { invoiceSeq } = await params;
  let session;
  try {
    session = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError) redirect('/super-admin/login');
    throw error;
  }
  const seq = Number(invoiceSeq);
  const invoice = Number.isFinite(seq) ? await getInvoice(seq) : null;
  if (!invoice) notFound();
  const store = await getStore(invoice.storeId);
  if (!store) notFound();
  return (
    <SuperAdminPageShell title={`Invoice #${invoice.invoiceSeq}`} subtitle="Invoice detail" name={session.name} hidePhead>
      <InvoiceDetail invoice={invoice} store={store} />
    </SuperAdminPageShell>
  );
}
