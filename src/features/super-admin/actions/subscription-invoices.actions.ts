'use server';

import { requireSuperAdmin } from '@/server/auth/session';
import { getSubscriptionInvoiceToken } from '@/server/auth/token';

export async function getSubscriptionInvoiceAccessAction(invoiceSeq: number): Promise<{ invoiceSeq: number; token: string }> {
  await requireSuperAdmin();
  const token = getSubscriptionInvoiceToken(invoiceSeq);
  return { invoiceSeq, token };
}
