'use server';

import { requireStoreSession, resolveStoreSelection } from '@/server/auth/session';
import { getOrCreateOrderInvoice } from '@/server/services/order-invoices';

// Get-or-create is idempotent — the invoice number is assigned once, on
// first call, and every later call (from this action or the PDF route)
// returns the same one. No role restriction: any signed-in member of the
// order's store (owner or employee) can view an order's invoice, matching
// today's order-detail access.
export async function getOrderInvoiceAccessAction(orderCode: string): Promise<{ invoiceSeq: number; accessToken: string }> {
  const storeSelection = await resolveStoreSelection();
  const session = await requireStoreSession(storeSelection?.multiStore ? storeSelection.storeId : undefined);
  const invoice = await getOrCreateOrderInvoice(session.storeId, orderCode);
  return { invoiceSeq: invoice.invoiceSeq, accessToken: invoice.accessToken };
}
