'use server';

import { requireStoreSession, resolveStoreSelection } from '@/server/auth/session';
import { encryptSubscriptionInvoiceRef } from '@/server/auth/token';
import { getInvoice } from '@/server/services/stores';

// Owner-only: returns the opaque public path for one of the organization's own
// subscription invoices. Another organization's invoice reads as not found.
export async function getSubscriptionInvoiceLinkAction(invoiceSeq: number): Promise<{ path: string }> {
  const selection = await resolveStoreSelection();
  const session = await requireStoreSession(selection?.multiStore ? selection.storeId : undefined, 'OWNER', undefined, { allowRestricted: true, allowLockedReadOnly: true });
  const invoice = await getInvoice(invoiceSeq);
  if (!invoice || invoice.storeId !== session.storeId) throw new Error('Invoice not found.');
  return { path: `/s/${encryptSubscriptionInvoiceRef(invoiceSeq)}` };
}
